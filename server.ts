// bb-plugin-homepage-dashboard — backend entry.
//
// Probes the live homelab estate over HTTP from the bb server (which sits on
// Paul's network) and serves the real results over RPC. A background poller
// refreshes the probes on an interval and broadcasts a realtime signal so the
// UI stays live without polling. The frontend never imports this module — only
// the shared serializable shapes in lib/runtime.ts.
//
// This is genuine live proof, not source claims: a green dot means the service
// actually answered a health route from the server's network. Source truth
// (runtime-truth-map.json) only seeds the inventory of WHAT to probe.

import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import {
  REALTIME_CHANNEL,
  type HomelabSnapshot,
  type ProbeKind,
  type ProbeResult,
  type ProbeStatus,
} from "./lib/runtime";
import { HOMELAB_TARGETS } from "./lib/homelab-endpoints";

const POLL_INTERVAL_MS = 30_000;
const PROBE_TIMEOUT_MS = 6_000;

export const rpcContract = defineRpcContract({
  getSnapshot: {
    input: z.null(),
    output: z.object({ snapshot: z.unknown() }),
  },
});

interface FetchLike {
  (input: string, init?: { signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
  }>;
}

function getFetch(): FetchLike | null {
  const g = globalThis as unknown as { fetch?: FetchLike };
  return typeof g.fetch === "function" ? g.fetch : null;
}

async function probeOne(
  target: (typeof HOMELAB_TARGETS)[number],
  fetchFn: FetchLike,
): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    let httpStatus: number | null = null;
    let up = false;
    try {
      const res = await fetchFn(target.url, { signal: controller.signal });
      httpStatus = res.status;
      up = res.status >= 200 && res.status < 300;
    } finally {
      clearTimeout(timer);
    }
    const latencyMs = Date.now() - started;
    const status: ProbeStatus = up ? "up" : "down";
    return {
      id: target.id,
      name: target.name,
      kind: target.kind,
      host: target.host,
      url: target.url,
      note: target.note,
      status,
      httpStatus,
      latencyMs,
      detail: up ? null : `HTTP ${httpStatus ?? "?"}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    const status: ProbeStatus = aborted ? "timeout" : "down";
    return {
      id: target.id,
      name: target.name,
      kind: target.kind,
      host: target.host,
      url: target.url,
      note: target.note,
      status,
      httpStatus: null,
      latencyMs: aborted ? PROBE_TIMEOUT_MS : latencyMs,
      detail: aborted ? `timeout >${PROBE_TIMEOUT_MS}ms` : err instanceof Error ? err.message : String(err),
    };
  }
}

async function buildSnapshot(): Promise<HomelabSnapshot> {
  const errors: string[] = [];
  const fetchFn = getFetch();
  let probes: ProbeResult[];

  if (!fetchFn) {
    errors.push("global fetch unavailable in this bb release — cannot probe live state");
    probes = HOMELAB_TARGETS.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind as ProbeKind,
      host: t.host,
      url: t.url,
      note: t.note,
      status: "unverified" as ProbeStatus,
      httpStatus: null,
      latencyMs: null,
      detail: "probe engine unavailable",
    }));
  } else {
    // Fan out all probes concurrently; one failure never blocks the others.
    probes = await Promise.all(HOMELAB_TARGETS.map((t) => probeOne(t, fetchFn)));
  }

  const summary = {
    total: probes.length,
    up: probes.filter((p) => p.status === "up").length,
    down: probes.filter((p) => p.status === "down").length,
    timeout: probes.filter((p) => p.status === "timeout").length,
    unverified: probes.filter((p) => p.status === "unverified").length,
  };
  const slowestMs = probes.reduce((max, p) => Math.max(max, p.latencyMs ?? 0), 0);

  return {
    generatedAt: Date.now(),
    slowestMs,
    errors,
    probes,
    summary,
  };
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  let latest: HomelabSnapshot | null = null;
  let refreshing = false;

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      latest = await buildSnapshot();
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
      return { snapshot: latest as HomelabSnapshot };
    },
  });

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

  // Agent/terminal-facing command: dump the live homelab probe results.
  bb.cli.register({
    name: "homepage-dashboard",
    summary: "Show live homelab runtime state (probed endpoints)",
    commands: [
      {
        name: "snapshot",
        summary: "Print a compact live-state snapshot of the homelab",
        usage: "bb homepage-dashboard snapshot",
      },
    ],
    async run(_argv, _ctx) {
      const snap = await buildSnapshot();
      const lines: string[] = [];
      const ts = new Date(snap.generatedAt).toLocaleTimeString();
      lines.push(`homelab live state @ ${ts}  (${snap.summary.up}/${snap.summary.total} up)`);
      for (const p of snap.probes) {
        const mark = p.status === "up" ? "UP  " : p.status === "timeout" ? "TIME" : p.status === "unverified" ? "??  " : "DOWN";
        const lat = p.latencyMs != null ? `${p.latencyMs}ms` : "—";
        lines.push(`  [${mark}] ${p.name.padEnd(18)} ${p.host.padEnd(18)} ${lat}  ${p.detail ?? ""}`.trimEnd());
      }
      if (snap.errors.length > 0) {
        lines.push("errors:");
        for (const e of snap.errors) lines.push(`  ! ${e}`);
      }
      return { exitCode: 0, stdout: lines.join("\n") };
    },
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
