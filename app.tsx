// bb-plugin-homepage-dashboard — frontend entry.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app are provided by the BB app at load time (never bundled),
// so this file must be loaded by BB, not imported directly.
//
// The dashboard pulls a runtime snapshot over RPC and keeps it live via the
// plugin's realtime signal plus a refresh on realtime reconnection.
import { useCallback, useEffect, useRef, useState } from "react";
import { definePluginApp, useBbContext, useBbNavigate, useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { REALTIME_CHANNEL, type RuntimeSnapshot } from "./lib/runtime";
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
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const { snapshot: snap } = await rpc.call("getSnapshot");
      setSnapshot((snap as RuntimeSnapshot | null) ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [rpc]);

  // Initial load + refresh on the plugin's broadcast signal.
  useEffect(() => {
    void load();
  }, [load]);
  useRealtime(REALTIME_CHANNEL, () => void load());

  // Reconciliation: after a reconnection the snapshot may be stale, refetch.
  const wasConnected = useRef(conn);
  useEffect(() => {
    if (conn === "connected" && wasConnected.current !== "connected") void load();
    wasConnected.current = conn;
  }, [conn, load]);

  return { snapshot, loading, error, reload: load };
}

function ThreadStatusBadge({ status }: { status: string }) {
  const tone = status === "active" ? "ok" : status === "error" ? "bad" : status === "idle" ? "muted" : "warn";
  return <StatusPill tone={tone} label={status} />;
}

function FullDashboard() {
  const { snapshot, loading, error, reload } = useSnapshot();
  const navigate = useBbNavigate();

  return (
    <div className="p-4 md:p-5">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Runtime Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Live state of the running bb instance
              {snapshot ? ` · updated ${new Date(snapshot.generatedAt).toLocaleTimeString()}` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            Failed to load runtime state: {error}
          </div>
        ) : null}

        {!snapshot ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {loading ? "Loading runtime state…" : "No snapshot available."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Kpi label="bb version" value={snapshot.server.version} sub={snapshot.server.hasAttention ? "attention requested" : "no attention"} />
              <Kpi label="Projects" value={snapshot.projects.length} />
              <Kpi
                label="Threads"
                value={snapshot.threads.total}
                sub={`${snapshot.threads.active} active · ${snapshot.threads.idle} idle`}
              />
              <Kpi label="Hosts" value={snapshot.hosts.length} sub={`${snapshot.hosts.filter((h) => h.status === "connected").length} connected`} />
              <Kpi label="Providers" value={snapshot.providers.length} />
              <Kpi label="Plugins" value={snapshot.plugins.length} sub={`${snapshot.plugins.filter((p) => p.source.startsWith("builtin")).length} builtin`} />
              <Kpi label="Thread errors" value={snapshot.threads.error} sub={snapshot.threads.error ? "needs review" : "none"} />
              <Kpi label="Orphaned builtins" value={snapshot.plugins.filter((p) => p.isOrphanedBuiltin).length} />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Hosts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {snapshot.hosts.length === 0 ? (
                    <div className="text-muted-foreground">No hosts.</div>
                  ) : (
                    snapshot.hosts.map((h) => (
                      <div key={h.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{h.name}</span>
                        <StatusPill
                          tone={h.status === "connected" ? "ok" : h.status === "disconnected" ? "bad" : "muted"}
                          label={h.status}
                        />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Providers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {snapshot.providers.length === 0 ? (
                    <div className="text-muted-foreground">No providers.</div>
                  ) : (
                    snapshot.providers.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{p.displayName}</span>
                        <StatusPill tone="muted" label={p.supportsServiceTier ? "tiers" : "flat"} />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Plugins</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {snapshot.plugins.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {p.id} <span className="text-muted-foreground">v{p.version}</span>
                      </span>
                      <StatusPill
                        tone={
                          p.source.startsWith("builtin")
                            ? "ok"
                            : p.updateOutcome && p.updateOutcome !== "current"
                              ? "warn"
                              : "muted"
                        }
                        label={p.source.startsWith("builtin") ? "builtin" : p.provenance}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent threads</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {snapshot.threads.recent.length === 0 ? (
                    <div className="text-muted-foreground">No threads.</div>
                  ) : (
                    snapshot.threads.recent.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => navigate.toThread(t.id)}
                        className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left hover:bg-muted"
                      >
                        <span className="truncate">{t.title ?? "(untitled)"}</span>
                        <ThreadStatusBadge status={t.status} />
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {snapshot.projects.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Projects</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {snapshot.projects.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {p.name} <span className="text-muted-foreground">· {p.kind}</span>
                        {p.gitRemoteUrl ? <span className="text-muted-foreground"> · git</span> : null}
                      </span>
                      <StatusPill tone="muted" label={`${p.sourceCount} src`} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

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
          </>
        )}
      </div>
    </div>
  );
}

function HomepageSection() {
  const { projectId } = useBbContext();
  const { snapshot, loading, error, reload } = useSnapshot();
  const navigate = useBbNavigate();

  // `projectId` is part of the slot contract; used to scope a footer hint.
  const scopeHint = projectId === null ? "no project selected" : "project in view";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Runtime state</CardTitle>
        <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error ? (
          <div className="text-red-600 dark:text-red-400">Failed to load: {error}</div>
        ) : !snapshot ? (
          <div className="text-muted-foreground">{loading ? "Loading…" : "No snapshot."}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Threads" value={snapshot.threads.total} sub={`${snapshot.threads.active} active`} />
              <Kpi label="Hosts" value={snapshot.hosts.length} sub={`${snapshot.hosts.filter((h) => h.status === "connected").length} up`} />
              <Kpi label="Plugins" value={snapshot.plugins.length} />
              <Kpi label="version" value={snapshot.server.version} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {snapshot.threads.error > 0 ? <StatusPill tone="bad" label={`${snapshot.threads.error} thread errors`} /> : null}
              {snapshot.server.hasAttention ? <StatusPill tone="warn" label="attention requested" /> : null}
              <StatusPill tone="muted" label={scopeHint} />
            </div>
            <Button size="sm" variant="link" className="px-0" onClick={() => navigate.toPluginPanel("dashboard")}>
              Open full dashboard →
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
    title: "Runtime Dashboard",
    component: HomepageSection,
  });

  app.slots.navPanel({
    id: "dashboard",
    title: "Runtime Dashboard",
    icon: "Activity",
    path: "dashboard",
    component: FullDashboard,
  });
});
