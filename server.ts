// bb-plugin-homepage-dashboard — backend entry.
//
// Gathers a live snapshot of the running bb runtime (server, projects,
// threads, hosts, providers, plugins) and serves it over RPC. A background
// poller refreshes the snapshot on an interval and broadcasts a realtime
// signal so the UI can pull a fresh copy without polling. The frontend never
// imports this module's implementation — only the RPC contract type and the
// shared serializable shapes in lib/runtime.ts.

import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import {
  REALTIME_CHANNEL,
  type HostLike,
  type PluginLike,
  type ProviderLike,
  type ProjectLike,
  type RuntimeSnapshot,
  type ThreadLike,
} from "./lib/runtime";

const POLL_INTERVAL_MS = 20_000;

export const rpcContract = defineRpcContract({
  getSnapshot: {
    input: z.null(), // null input lets the frontend omit the argument
    output: z.object({
      snapshot: z.unknown(),
    }),
  },
});

type Maybe<T> = T | undefined;

// Safe wrapper: inference keeps the awaited success type separate from the
// supplied fallback type, so we can pass a structurally different fallback
// (e.g. an empty object) without forcing the success result to that shape.
async function safe<Success, Fallback>(
  fn: () => Promise<Success>,
  fallback: Fallback,
  errors: string[],
  label: string,
): Promise<Success | Fallback> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// Optional, release-dependent SDK surface. Guard every access so the plugin
// loads on bb versions that do not expose it.
interface SdkWithRealtime {
  realtime?: { subscribe: (args: unknown) => () => void };
}

async function buildSnapshot(bb: BbPluginApi): Promise<RuntimeSnapshot> {
  const errors: string[] = [];
  const sdk = bb.sdk;

  const [serverVersion, attention] = await Promise.all([
    safe(() => sdk.system.version(), { version: "unknown" } as { version: string }, errors, "system.version"),
    safe(() => sdk.system.attention({}), { hasAttention: false } as { hasAttention: boolean }, errors, "system.attention"),
  ]);

  const [projectsRaw, threadsRaw, hostsRaw, providersRaw, pluginsRaw] = await Promise.all([
    safe(() => sdk.projects.list({ includePersonal: true }), [], errors, "projects.list"),
    safe(() => sdk.threads.list({ limit: 100 }), [], errors, "threads.list"),
    safe(() => sdk.hosts.list(), [], errors, "hosts.list"),
    safe(() => sdk.providers.list(), [], errors, "providers.list"),
    safe(() => sdk.plugins.list(), [], errors, "plugins.list"),
  ]);

  const projects = asArray<ProjectLike>(projectsRaw);
  const threads = asArray<ThreadLike>(threadsRaw);
  const hosts = asArray<HostLike>(hostsRaw);
  const providers = asArray<ProviderLike>(providersRaw);
  const plugins = asArray<PluginLike>(pluginsRaw);

  // Thread aggregation.
  let active = 0;
  let idle = 0;
  let errorCount = 0;
  let other = 0;
  for (const t of threads) {
    switch (t.status) {
      case "active":
        active++;
        break;
      case "idle":
        idle++;
        break;
      case "error":
        errorCount++;
        break;
      default:
        other++;
    }
  }
  const recent = [...threads]
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 8)
    .map((t) => ({
      id: t.id ?? "",
      title: t.title ?? null,
      status: t.status ?? "unknown",
      projectId: t.projectId ?? "",
      providerId: t.providerId ?? "",
      environmentId: t.environmentId ?? null,
      updatedAt: t.updatedAt ?? 0,
    }));

  return {
    generatedAt: Date.now(),
    errors,
    server: {
      version: (serverVersion as { version?: string })?.version ?? "unknown",
      hasAttention: (attention as { hasAttention?: boolean })?.hasAttention ?? false,
    },
    projects: projects.map((p) => ({
      id: p.id ?? "",
      name: p.name ?? "(unnamed)",
      kind: p.kind ?? "standard",
      gitRemoteUrl: p.gitRemoteUrl ?? null,
      sourceCount: Array.isArray(p.sources) ? p.sources.length : 0,
    })),
    threads: {
      total: threads.length,
      active,
      idle,
      error: errorCount,
      other,
      recent,
    },
    hosts: hosts.map((h) => ({
      id: h.id ?? "",
      name: h.name ?? "(unknown host)",
      type: h.type ?? "unknown",
      status: h.status ?? "unknown",
    })),
    providers: providers.map((p) => ({
      id: p.id ?? "",
      displayName: p.displayName ?? p.id ?? "(unknown)",
      supportsServiceTier: Boolean(p.capabilities?.supportsServiceTier),
    })),
    plugins: plugins.map((p) => ({
      id: p.id ?? "",
      source: p.source ?? "unknown",
      provenance: p.provenance ?? "unknown",
      version: p.version ?? "unknown",
      isOrphanedBuiltin: Boolean(p.isOrphanedBuiltin),
      updateOutcome: p.updateState?.outcome ?? null,
    })),
  };
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  let latest: RuntimeSnapshot | null = null;
  let refreshing = false;

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      latest = await buildSnapshot(bb);
      bb.realtime.publish(REALTIME_CHANNEL, { generatedAt: latest.generatedAt });
    } catch (err) {
      bb.log.error(`snapshot refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      refreshing = false;
    }
  }

  bb.rpc.register(rpcContract, {
    getSnapshot: async () => {
      if (!latest) await refresh();
      return { snapshot: latest as RuntimeSnapshot };
    },
  });

  // Poll on an interval; abort promptly on reload so the service stops cleanly.
  bb.background.service("snapshot-poller", {
    async start(signal) {
      await refresh();
      while (!signal.aborted) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, POLL_INTERVAL_MS);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
        if (signal.aborted) break;
        await refresh();
      }
    },
  });

  // React to live entity changes: when a thread, project, host, or the system
  // changes, refresh immediately so the dashboard stays current between polls.
  const unsubscribers: Array<() => void> = [];
  const subscribeSafe = (name: string, fn: () => void) => {
    try {
      const rt = (bb.sdk as SdkWithRealtime).realtime;
      if (!rt) return;
      const unsub = rt.subscribe({ event: name, callback: fn });
      if (typeof unsub === "function") unsubscribers.push(unsub);
    } catch {
      // Not all bb versions expose sdk.realtime; polling still covers us.
    }
  };
  subscribeSafe("thread:changed", () => void refresh());
  subscribeSafe("project:changed", () => void refresh());
  subscribeSafe("host:changed", () => void refresh());
  subscribeSafe("system:changed", () => void refresh());

  // Agent/terminal-facing command: dump a compact, machine-friendly view of
  // the live runtime state. Exercises the same snapshot builder the UI uses.
  bb.cli.register({
    name: "homepage-dashboard",
    summary: "Show live runtime state of the bb instance",
    commands: [
      {
        name: "snapshot",
        summary: "Print a compact runtime snapshot",
        usage: "bb homepage-dashboard snapshot",
      },
    ],
    async run(_argv, ctx) {
      const snap = await buildSnapshot(bb);
      const lines: string[] = [];
      lines.push(`bb version: ${snap.server.version}${snap.server.hasAttention ? " (attention)" : ""}`);
      lines.push(`projects: ${snap.projects.length}  threads: ${snap.threads.total} (active ${snap.threads.active}, idle ${snap.threads.idle}, error ${snap.threads.error})`);
      lines.push(`hosts: ${snap.hosts.length} (${snap.hosts.filter((h) => h.status === "connected").length} connected)  providers: ${snap.providers.length}  plugins: ${snap.plugins.length}`);
      lines.push("plugins:");
      for (const p of snap.plugins) lines.push(`  - ${p.id} v${p.version} [${p.source.startsWith("builtin") ? "builtin" : p.provenance}]`);
      if (snap.errors.length > 0) {
        lines.push("errors:");
        for (const e of snap.errors) lines.push(`  ! ${e}`);
      }
      return { exitCode: 0, stdout: lines.join("\n") };
    },
  });

  bb.onDispose(() => {
    for (const unsub of unsubscribers) {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    }
    bb.log.info("disposed");
  });
}
