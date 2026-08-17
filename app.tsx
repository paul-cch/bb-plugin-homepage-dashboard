// bb-plugin-homepage-dashboard — frontend entry.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app are provided by the BB app at load time (never bundled).
//
// The dashboard represents the FULL homelab estate: every entry from the
// runtime truth map. Publicly reachable services are probed live over HTTP
// from the bb server; private / source-owned / retired entries are shown as
// honest inventory with their portfolio status. It keeps live via the plugin's
// realtime signal plus a refetch on realtime reconnection.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { definePluginApp, useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import {
  REALTIME_CHANNEL,
  type HomelabSnapshot,
  type ProbeKind,
  type ProbeReach,
  type ProbeResult,
  type ProbeStatus,
} from "./lib/runtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Tone = "ok" | "warn" | "bad" | "muted" | "accent";

function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "bg-red-500/15 text-red-600 dark:text-red-400"
          : tone === "accent"
            ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
            : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

function probeTone(status: ProbeStatus): Tone {
  switch (status) {
    case "up":
      return "ok";
    case "gated":
      return "accent";
    case "timeout":
      return "warn";
    case "down":
      return "bad";
    default:
      return "muted";
  }
}

const STATUS_LABEL: Record<ProbeStatus, string> = {
  up: "up",
  gated: "gated",
  down: "down",
  timeout: "timeout",
  inventory: "inventory",
};

const REACH_LABEL: Record<ProbeReach, string> = {
  public: "public",
  protected: "access-gated",
  private: "private",
  none: "not-exposed",
  retired: "retired",
};

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: Tone }) {
  const valueCls =
    tone === "bad"
      ? "text-red-600 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "ok"
          ? "text-emerald-600 dark:text-emerald-400"
          : "";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${valueCls}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function useSnapshot() {
  const rpc = useRpc<typeof rpcContract>();
  const conn = useRealtimeConnectionState();
  const [snapshot, setSnapshot] = useState<HomelabSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const { snapshot: snap } = await rpc.call("getSnapshot");
      setSnapshot((snap as HomelabSnapshot | null) ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtime(REALTIME_CHANNEL, () => void load());

  const wasConnected = useRef(conn);
  useEffect(() => {
    if (conn === "connected" && wasConnected.current !== "connected") void load();
    wasConnected.current = conn;
  }, [conn, load]);

  return { snapshot, loading, error, reload: load };
}

// Group the estate into meaningful sections, preserving a stable order.
const SECTION_ORDER: Array<{ key: string; title: string; match: (p: ProbeResult) => boolean }> = [
  { key: "service", title: "Core services", match: (p) => p.reach !== "retired" && p.kind === "service" },
  { key: "app", title: "Apps", match: (p) => p.reach !== "retired" && p.kind === "app" },
  { key: "remote", title: "Remote nodes", match: (p) => p.reach !== "retired" && p.kind === "remote" },
  { key: "infra", title: "Infrastructure", match: (p) => p.reach !== "retired" && p.kind === "infra" },
  { key: "retired", title: "Retired / provenance", match: (p) => p.reach === "retired" },
];

function sectionize(probes: ProbeResult[]): Array<{ key: string; title: string; items: ProbeResult[] }> {
  return SECTION_ORDER.map((s) => ({ key: s.key, title: s.title, items: probes.filter(s.match) })).filter(
    (s) => s.items.length > 0,
  );
}

const KIND_LABEL: Record<ProbeKind, string> = {
  app: "App",
  service: "Service",
  infra: "Infra",
  remote: "Remote",
};

function ProbeRow({ p }: { p: ProbeResult }) {
  const dim = p.reach === "retired" || p.status === "inventory";
  return (
    <div className={`flex items-center justify-between gap-2 py-1.5 ${dim ? "opacity-70" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium">{p.name}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{KIND_LABEL[p.kind]}</span>
          <span className="text-[10px] text-muted-foreground">· {p.host}</span>
          {p.portfolio !== "active" ? (
            <span className="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">{p.portfolio}</span>
          ) : null}
          {p.reach !== "public" ? (
            <span className="rounded bg-violet-500/10 px-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
              {REACH_LABEL[p.reach]}
            </span>
          ) : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">{p.url ?? p.note}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {p.latencyMs != null ? <span className="tabular-nums text-xs text-muted-foreground">{p.latencyMs}ms</span> : null}
        <StatusPill tone={probeTone(p.status)} label={STATUS_LABEL[p.status]} />
      </div>
    </div>
  );
}

function sectionTone(items: ProbeResult[]): Tone {
  const probed = items.filter((i) => i.status !== "inventory");
  if (probed.length === 0) return "muted";
  const bad = probed.filter((i) => i.status === "down" || i.status === "timeout").length;
  if (bad === 0) return "ok";
  return bad === probed.length ? "bad" : "warn";
}

function sectionLabel(items: ProbeResult[]): string {
  const live = items.filter((i) => i.status === "up" || i.status === "gated").length;
  const probed = items.filter((i) => i.status !== "inventory").length;
  if (probed === 0) return `${items.length} inventory`;
  return `${live}/${probed} live · ${items.length} total`;
}

function FullDashboard() {
  const { snapshot, loading, error, reload } = useSnapshot();

  const sections = useMemo(() => (snapshot ? sectionize(snapshot.probes) : []), [snapshot]);

  return (
    <div className="p-4 md:p-5">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Homelab Estate — Live</h1>
            <p className="text-sm text-muted-foreground">
              The full portfolio from the runtime truth map · live HTTP probes from the bb server
              {snapshot ? ` · updated ${new Date(snapshot.generatedAt).toLocaleTimeString()}` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            Failed to load live state: {error}
          </div>
        ) : null}

        {!snapshot ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {loading ? "Probing homelab estate…" : "No snapshot available."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Estate" value={snapshot.summary.total} sub={`${snapshot.summary.active} active`} />
              <Kpi
                label="Live"
                value={`${snapshot.summary.up + snapshot.summary.gated}/${snapshot.summary.probed}`}
                sub="probed reachable"
                tone="ok"
              />
              <Kpi
                label="Down"
                value={snapshot.summary.down}
                sub={snapshot.summary.down ? "needs attention" : "none"}
                tone={snapshot.summary.down ? "bad" : undefined}
              />
              <Kpi
                label="Timeout"
                value={snapshot.summary.timeout}
                tone={snapshot.summary.timeout ? "warn" : undefined}
              />
              <Kpi
                label="Inventory"
                value={snapshot.summary.inventory}
                sub={`${snapshot.summary.reach.private} priv · ${snapshot.summary.reach.none} src`}
              />
              <Kpi label="Slowest" value={`${snapshot.slowestMs}ms`} />
            </div>

            {sections.map((section) => (
              <Card key={section.key}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{section.title}</span>
                    <StatusPill tone={sectionTone(section.items)} label={sectionLabel(section.items)} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y text-sm">
                  {section.items.map((p) => (
                    <ProbeRow key={p.id} p={p} />
                  ))}
                </CardContent>
              </Card>
            ))}

            {snapshot.errors.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Area errors</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  {snapshot.errors.map((e, i) => (
                    <div key={i} className="break-words">
                      {e}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-600 dark:text-emerald-400">Green</span> = answered its health route ·{" "}
              <span className="text-violet-600 dark:text-violet-400">gated</span> = public edge live behind Cloudflare
              Access ·{" "}
              <span className="text-red-600 dark:text-red-400">down</span> = no answer on a public route. The{" "}
              {snapshot.summary.inventory} inventory rows (private Twingate, source-owned/not-exposed, retired) can't be
              probed from this vantage — that's a portfolio fact, not an outage. Live probes are independent of the
              repo's source claims.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function HomepageSection() {
  const { snapshot, loading, error, reload } = useSnapshot();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Homelab Estate — Live</CardTitle>
        <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error ? (
          <div className="text-red-600 dark:text-red-400">Failed to load: {error}</div>
        ) : !snapshot ? (
          <div className="text-muted-foreground">{loading ? "Probing…" : "No snapshot."}</div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              <Kpi label="Estate" value={snapshot.summary.total} />
              <Kpi label="Live" value={`${snapshot.summary.up + snapshot.summary.gated}/${snapshot.summary.probed}`} tone="ok" />
              <Kpi label="Down" value={snapshot.summary.down} tone={snapshot.summary.down ? "bad" : undefined} />
              <Kpi label="Inventory" value={snapshot.summary.inventory} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {snapshot.probes
                .filter((p) => p.status !== "inventory")
                .map((p) => (
                  <StatusPill key={p.id} tone={probeTone(p.status)} label={p.name} />
                ))}
              {snapshot.summary.inventory > 0 ? (
                <StatusPill tone="muted" label={`+${snapshot.summary.inventory} inventory`} />
              ) : null}
            </div>
            <Button
              size="sm"
              variant="link"
              className="px-0"
              onClick={() => window.location.assign("#/plugins/homepage-dashboard")}
            >
              Open full estate view →
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default definePluginApp((app) => {
  app.slots.homepageSection({
    id: "homepage-dashboard",
    title: "Homelab Estate — Live",
    component: HomepageSection,
  });

  app.slots.navPanel({
    id: "dashboard",
    title: "Homelab Estate",
    icon: "Activity",
    path: "dashboard",
    component: FullDashboard,
  });
});
