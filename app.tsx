// bb-plugin-homepage-dashboard — frontend entry.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app are provided by the BB app at load time (never bundled).
//
// The dashboard pulls a live homelab snapshot over RPC (real HTTP probe
// results from the bb server) and keeps it live via the plugin's realtime
// signal plus a refetch on realtime reconnection. It shows what is ACTUALLY
// up on the estate, not what the source claims should be.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { definePluginApp, useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { REALTIME_CHANNEL, type HomelabSnapshot, type ProbeKind, type ProbeResult, type ProbeStatus } from "./lib/runtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function StatusPill({ tone, label }: { tone: "ok" | "warn" | "bad" | "muted"; label: string }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "bg-red-500/15 text-red-600 dark:text-red-400"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

function probeTone(status: ProbeStatus): "ok" | "warn" | "bad" | "muted" {
  switch (status) {
    case "up":
      return "ok";
    case "timeout":
      return "warn";
    case "down":
      return "bad";
    default:
      return "muted";
  }
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
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

// Group probes by the host/VM node they live on, preserving a sensible order.
function groupByHost(probes: ProbeResult[]): Array<{ host: string; items: ProbeResult[] }> {
  const order: string[] = [];
  const map = new Map<string, ProbeResult[]>();
  for (const p of probes) {
    if (!map.has(p.host)) {
      map.set(p.host, []);
      order.push(p.host);
    }
    map.get(p.host)!.push(p);
  }
  return order.map((host) => ({ host, items: map.get(host)! }));
}

const KIND_LABEL: Record<ProbeKind, string> = {
  app: "App",
  service: "Service",
  infra: "Infra",
  remote: "Remote",
  operator: "Operator",
};

function ProbeRow({ p }: { p: ProbeResult }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{p.name}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{KIND_LABEL[p.kind]}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">{p.url}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {p.latencyMs != null ? <span className="tabular-nums text-xs text-muted-foreground">{p.latencyMs}ms</span> : null}
        <StatusPill tone={probeTone(p.status)} label={p.status} />
      </div>
    </div>
  );
}

function FullDashboard() {
  const { snapshot, loading, error, reload } = useSnapshot();

  const groups = useMemo(
    () => (snapshot ? groupByHost(snapshot.probes) : []),
    [snapshot],
  );

  return (
    <div className="p-4 md:p-5">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Homelab — Live State</h1>
            <p className="text-sm text-muted-foreground">
              Real HTTP probes from the bb server
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
            {loading ? "Probing homelab endpoints…" : "No snapshot available."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Services up" value={`${snapshot.summary.up}/${snapshot.summary.total}`} sub="probed live" />
              <Kpi label="Down" value={snapshot.summary.down} sub={snapshot.summary.down ? "needs attention" : "none"} />
              <Kpi label="Timeout" value={snapshot.summary.timeout} />
              <Kpi label="Slowest" value={`${snapshot.slowestMs}ms`} />
            </div>

            {groups.map((group) => {
              const up = group.items.filter((i) => i.status === "up").length;
              return (
                <Card key={group.host}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>{group.host}</span>
                      <StatusPill
                        tone={up === group.items.length ? "ok" : up > 0 ? "warn" : "bad"}
                        label={`${up}/${group.items.length} up`}
                      />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y text-sm">
                    {group.items.map((p) => (
                      <ProbeRow key={p.id} p={p} />
                    ))}
                  </CardContent>
                </Card>
              );
            })}

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
              Green = the service answered its health route from the bb server's network. These are
              live reachability probes, independent of the repo's source claims.
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
        <CardTitle>Homelab — Live</CardTitle>
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
            <div className="grid grid-cols-3 gap-2">
              <Kpi label="Up" value={`${snapshot.summary.up}/${snapshot.summary.total}`} />
              <Kpi label="Down" value={snapshot.summary.down} />
              <Kpi label="Slowest" value={`${snapshot.slowestMs}ms`} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {snapshot.probes.slice(0, 8).map((p) => (
                <StatusPill key={p.id} tone={probeTone(p.status)} label={p.name} />
              ))}
              {snapshot.probes.length > 8 ? (
                <StatusPill tone="muted" label={`+${snapshot.probes.length - 8} more`} />
              ) : null}
            </div>
            <Button
              size="sm"
              variant="link"
              className="px-0"
              onClick={() => window.location.assign("#/plugins/homepage-dashboard")}
            >
              Open full live view →
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
    title: "Homelab — Live",
    component: HomepageSection,
  });

  app.slots.navPanel({
    id: "dashboard",
    title: "Homelab — Live",
    icon: "Activity",
    path: "dashboard",
    component: FullDashboard,
  });
});
