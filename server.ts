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
  type ProbeResult,
  type ProbeStatus,
} from "./lib/runtime";
import { HOMELAB_TARGETS, type ProbeTarget } from "./lib/homelab-endpoints";

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

// Carry the target's identity fields onto every result so the frontend has the
// full estate row regardless of whether it was probed.
function base(target: ProbeTarget): Omit<ProbeResult, "status" | "httpStatus" | "latencyMs" | "detail"> {
  return {
    id: target.id,
    name: target.name,
    kind: target.kind,
    host: target.host,
    portfolio: target.portfolio,
    url: target.url,
    note: target.note,
    reach: target.reach,
  };
}

// An inventory row: represented in the estate, but not probed from here.
function inventoryResult(target: ProbeTarget, detail: string): ProbeResult {
  return { ...base(target), status: "inventory", httpStatus: null, latencyMs: null, detail };
}

// A target is only reached out to when it carries a route and is either a real
// public health endpoint or a public-but-auth-gated (protected) hostname.
function isProbeable(t: ProbeTarget): boolean {
  return t.url != null && (t.reach === "public" || t.reach === "protected");
}

async function probeOne(target: ProbeTarget, fetchFn: FetchLike): Promise<ProbeResult> {
  const url = target.url as string; // guarded by isProbeable
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    let httpStatus: number | null = null;
    try {
      const res = await fetchFn(url, { signal: controller.signal });
      httpStatus = res.status;
    } finally {
      clearTimeout(timer);
    }
    const latencyMs = Date.now() - started;
    const code = httpStatus ?? 0;
    const ok = code >= 200 && code < 300;
    // A redirect or auth wall (3xx / 401 / 403) means the edge answered — the
    // ingress/tunnel is live, just behind Cloudflare Access from this vantage.
    // That is "gated", never a false "down". Only a hard 4xx/5xx or a
    // connection error is a real outage signal. This is reach-independent so a
    // documented-public route that redirects here isn't misreported.
    const gated = !ok && (code === 401 || code === 403 || (code >= 300 && code < 400));
    const status: ProbeStatus = ok ? "up" : gated ? "gated" : "down";
    const detail = ok
      ? null
      : gated
        ? `edge live · auth wall (HTTP ${code})`
        : `HTTP ${httpStatus ?? "?"}`;
    return { ...base(target), status, httpStatus, latencyMs, detail };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    const status: ProbeStatus = aborted ? "timeout" : "down";
    return {
      ...base(target),
      status,
      httpStatus: null,
      latencyMs: aborted ? PROBE_TIMEOUT_MS : latencyMs,
      detail: aborted ? `timeout >${PROBE_TIMEOUT_MS}ms` : err instanceof Error ? err.message : String(err),
    };
  }
}

// Why a target is inventory-only rather than probed, per reach class.
function inventoryReason(t: ProbeTarget): string {
  switch (t.reach) {
    case "private":
      return "private Twingate route — not probed from this vantage";
    case "retired":
      return "retired / provenance — no live route";
    case "protected":
      return "public but Access-gated; no confirmed unauth route to probe";
    default:
      return "source-owned / not-exposed — no ingress to probe";
  }
}

async function buildSnapshot(): Promise<HomelabSnapshot> {
  const errors: string[] = [];
  const fetchFn = getFetch();
  let probes: ProbeResult[];

  if (!fetchFn) {
    errors.push("global fetch unavailable in this bb release — cannot probe live state");
    probes = HOMELAB_TARGETS.map((t) => inventoryResult(t, "probe engine unavailable"));
  } else {
    // Fan out all live probes concurrently; one failure never blocks the
    // others. Everything else (private .iris.sys, source-owned/not-exposed,
    // retired) is represented as honest inventory rather than a misleading
    // "down" — a blank there is a vantage or portfolio fact, not an outage.
    probes = await Promise.all(
      HOMELAB_TARGETS.map<Promise<ProbeResult>>((t) =>
        isProbeable(t) ? probeOne(t, fetchFn) : Promise.resolve(inventoryResult(t, inventoryReason(t))),
      ),
    );
  }

  const count = (pred: (p: ProbeResult) => boolean) => probes.filter(pred).length;
  const summary = {
    total: probes.length,
    probed: count((p) => p.status !== "inventory"),
    up: count((p) => p.status === "up"),
    gated: count((p) => p.status === "gated"),
    down: count((p) => p.status === "down"),
    timeout: count((p) => p.status === "timeout"),
    inventory: count((p) => p.status === "inventory"),
    reach: {
      public: count((p) => p.reach === "public"),
      protected: count((p) => p.reach === "protected"),
      private: count((p) => p.reach === "private"),
      none: count((p) => p.reach === "none"),
      retired: count((p) => p.reach === "retired"),
    },
    active: count((p) => p.portfolio === "active"),
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
    async run(argv, _ctx) {
      const snap = await buildSnapshot();
      if (argv.includes("--json")) {
        return { exitCode: 0, stdout: JSON.stringify(snap) };
      }
      const lines: string[] = [];
      const ts = new Date(snap.generatedAt).toLocaleTimeString();
      const s = snap.summary;
      lines.push(`homelab estate @ ${ts} — ${s.total} entries (${s.active} active)`);
      lines.push(
        `  probed ${s.probed}: ${s.up} up · ${s.gated} gated · ${s.down} down · ${s.timeout} timeout` +
          `  |  inventory ${s.inventory}: ${s.reach.private} private · ${s.reach.none} source-only · ${s.reach.retired} retired`,
      );
      const mark = (p: ProbeResult): string => {
        switch (p.status) {
          case "up":
            return "UP  ";
          case "gated":
            return "GATE";
          case "timeout":
            return "TIME";
          case "down":
            return "DOWN";
          default:
            return p.reach === "private" ? "PRIV" : p.reach === "retired" ? "RETD" : "INV ";
        }
      };
      for (const p of snap.probes) {
        const lat = p.latencyMs != null ? `${p.latencyMs}ms` : "—";
        lines.push(`  [${mark(p)}] ${p.name.padEnd(24)} ${p.host.padEnd(18)} ${lat.padStart(6)}  ${p.detail ?? ""}`.trimEnd());
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
