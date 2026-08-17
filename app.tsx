// bb-plugin-homepage-dashboard — frontend entry.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app are provided by the BB app at load time (never bundled).
//
// The dashboard represents the FULL homelab estate: every entry from the
// runtime truth map. Publicly reachable services are probed live over HTTP
// from the bb server; private / source-owned / retired entries are shown as
// honest inventory with their portfolio status. It is interactive — search,
// filter, expand a row for detail, and re-check a single service on demand —
// and stays live via the plugin's realtime signal plus a refetch on reconnect.
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

const REACH_DESC: Record<ProbeReach, string> = {
  public: "Unauthenticated health route the bb server can reach — a 2xx is real proof.",
  protected: "Public hostname behind Cloudflare Access — probed for reachability; an auth wall means the ingress is live.",
  private: "Twingate-internal .iris.sys route — not reachable from the bb server's vantage, listed as inventory.",
  none: "Source-owned / not-exposed — no ingress to probe.",
  retired: "Tombstoned / provenance — kept so the estate is complete.",
};

// A row can be re-checked on demand only when there is an actual route to hit.
function canRecheck(p: ProbeResult): boolean {
  return p.url != null && (p.reach === "public" || p.reach === "protected");
}

function Kpi({
  label,
  value,
  sub,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}) {
  const valueCls =
    tone === "bad"
      ? "text-red-600 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "ok"
          ? "text-emerald-600 dark:text-emerald-400"
          : "";
  const interactive = onClick != null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`rounded-lg border bg-card p-3 text-left transition ${
        interactive ? "cursor-pointer hover:border-foreground/30 hover:bg-accent/40" : "cursor-default"
      } ${active ? "border-foreground/50 ring-1 ring-foreground/20" : ""}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${valueCls}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </button>
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

  // Re-probe a single target and adopt the server's freshly patched snapshot.
  const recheck = useCallback(
    async (id: string) => {
      const { snapshot: snap } = await rpc.call("probeTarget", { id });
      setSnapshot((snap as HomelabSnapshot | null) ?? null);
    },
    [rpc],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useRealtime(REALTIME_CHANNEL, () => void load());

  const wasConnected = useRef(conn);
  useEffect(() => {
    if (conn === "connected" && wasConnected.current !== "connected") void load();
    wasConnected.current = conn;
  }, [conn, load]);

  return { snapshot, loading, error, reload: load, recheck };
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

// Which status filters are offered, and how each maps onto a probe.
type StatusFilter = "all" | "live" | "down" | "timeout" | "inventory";
const STATUS_FILTERS: Array<{ key: StatusFilter; label: string; tone: Tone; match: (p: ProbeResult) => boolean }> = [
  { key: "all", label: "All", tone: "muted", match: () => true },
  { key: "live", label: "Live", tone: "ok", match: (p) => p.status === "up" || p.status === "gated" },
  { key: "down", label: "Down", tone: "bad", match: (p) => p.status === "down" },
  { key: "timeout", label: "Timeout", tone: "warn", match: (p) => p.status === "timeout" },
  { key: "inventory", label: "Inventory", tone: "muted", match: (p) => p.status === "inventory" },
];

function FilterChip({
  active,
  label,
  count,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone: Tone;
  onClick: () => void;
}) {
  const dotCls =
    tone === "ok"
      ? "bg-emerald-500"
      : tone === "bad"
        ? "bg-red-500"
        : tone === "warn"
          ? "bg-amber-500"
          : tone === "accent"
            ? "bg-violet-500"
            : "bg-muted-foreground/50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        active ? "border-foreground/40 bg-accent" : "border-transparent bg-muted hover:bg-accent/60"
      }`}
    >
      {tone !== "muted" ? <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} /> : null}
      <span>{label}</span>
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

function ProbeRow({
  p,
  expanded,
  onToggle,
  onRecheck,
  rechecking,
}: {
  p: ProbeResult;
  expanded: boolean;
  onToggle: () => void;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const dim = p.reach === "retired" || p.status === "inventory";
  return (
    <div className={dim ? "opacity-70" : ""}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 py-1.5 text-left hover:bg-accent/30"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
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
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {p.latencyMs != null ? (
            <span className="tabular-nums text-xs text-muted-foreground">{p.latencyMs}ms</span>
          ) : null}
          <StatusPill tone={probeTone(p.status)} label={rechecking ? "checking…" : STATUS_LABEL[p.status]} />
        </div>
      </button>

      {expanded ? (
        <div className="mb-1 ml-5 space-y-2 rounded-md bg-muted/40 p-3 text-xs">
          <p className="text-muted-foreground">{p.note}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <Detail label="Status" value={STATUS_LABEL[p.status]} />
            <Detail label="Reach" value={REACH_LABEL[p.reach]} />
            <Detail label="Portfolio" value={p.portfolio} />
            <Detail label="Host" value={p.host} />
            <Detail label="HTTP" value={p.httpStatus != null ? String(p.httpStatus) : "—"} />
            <Detail label="Latency" value={p.latencyMs != null ? `${p.latencyMs}ms` : "—"} />
          </div>
          {p.detail ? <p className="text-muted-foreground">↳ {p.detail}</p> : null}
          <p className="text-[11px] text-muted-foreground/80">{REACH_DESC[p.reach]}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {canRecheck(p) ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={rechecking}
                onClick={(e) => {
                  e.stopPropagation();
                  onRecheck();
                }}
              >
                {rechecking ? "Rechecking…" : "Recheck now"}
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground">No live route to re-check.</span>
            )}
            {p.url ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(p.url as string, "_blank", "noopener,noreferrer");
                }}
              >
                Open ↗
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="tabular-nums">{value}</div>
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
  const { snapshot, loading, error, reload, recheck } = useSnapshot();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [hideRetired, setHideRetired] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [rechecking, setRechecking] = useState<Set<string>>(() => new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const doRecheck = useCallback(
    async (id: string) => {
      setRechecking((prev) => new Set(prev).add(id));
      try {
        await recheck(id);
      } finally {
        setRechecking((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [recheck],
  );

  // The pool the filter chips count against (respects the retired toggle).
  const pool = useMemo(() => {
    const all = snapshot?.probes ?? [];
    return hideRetired ? all.filter((p) => p.reach !== "retired") : all;
  }, [snapshot, hideRetired]);

  const counts = useMemo(() => {
    const map: Record<StatusFilter, number> = { all: 0, live: 0, down: 0, timeout: 0, inventory: 0 };
    for (const f of STATUS_FILTERS) map[f.key] = pool.filter(f.match).length;
    return map;
  }, [pool]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statusMatch = STATUS_FILTERS.find((f) => f.key === statusFilter)!.match;
    return pool.filter((p) => {
      if (!statusMatch(p)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.host.toLowerCase().includes(q) ||
        p.portfolio.toLowerCase().includes(q) ||
        (p.url ?? "").toLowerCase().includes(q)
      );
    });
  }, [pool, query, statusFilter]);

  const sections = useMemo(() => sectionize(filtered), [filtered]);
  const s = snapshot?.summary;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-5">
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

        {!snapshot || !s ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {loading ? "Probing homelab estate…" : "No snapshot available."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Estate" value={s.total} sub={`${s.active} active`} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
              <Kpi
                label="Live"
                value={`${s.up + s.gated}/${s.probed}`}
                sub="probed reachable"
                tone="ok"
                active={statusFilter === "live"}
                onClick={() => setStatusFilter("live")}
              />
              <Kpi
                label="Down"
                value={s.down}
                sub={s.down ? "needs attention" : "none"}
                tone={s.down ? "bad" : undefined}
                active={statusFilter === "down"}
                onClick={() => setStatusFilter("down")}
              />
              <Kpi
                label="Timeout"
                value={s.timeout}
                tone={s.timeout ? "warn" : undefined}
                active={statusFilter === "timeout"}
                onClick={() => setStatusFilter("timeout")}
              />
              <Kpi
                label="Inventory"
                value={s.inventory}
                sub={`${s.reach.private} priv · ${s.reach.none} src`}
                active={statusFilter === "inventory"}
                onClick={() => setStatusFilter("inventory")}
              />
              <Kpi label="Slowest" value={`${snapshot.slowestMs}ms`} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, host, url…"
                className="h-8 min-w-[10rem] flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-foreground/40"
              />
              {STATUS_FILTERS.map((f) => (
                <FilterChip
                  key={f.key}
                  active={statusFilter === f.key}
                  label={f.label}
                  count={counts[f.key]}
                  tone={f.tone}
                  onClick={() => setStatusFilter(f.key)}
                />
              ))}
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={hideRetired} onChange={(e) => setHideRetired(e.target.checked)} />
                Hide retired
              </label>
            </div>

            {sections.length === 0 ? (
              <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
                No entries match {query ? `"${query}"` : "this filter"}.
                <Button
                  size="sm"
                  variant="link"
                  className="ml-1 px-0"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                  }}
                >
                  Clear
                </Button>
              </div>
            ) : (
              sections.map((section) => (
                <Card key={section.key}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>{section.title}</span>
                      <StatusPill tone={sectionTone(section.items)} label={sectionLabel(section.items)} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y text-sm">
                    {section.items.map((p) => (
                      <ProbeRow
                        key={p.id}
                        p={p}
                        expanded={expanded.has(p.id)}
                        onToggle={() => toggleExpanded(p.id)}
                        onRecheck={() => void doRecheck(p.id)}
                        rechecking={rechecking.has(p.id)}
                      />
                    ))}
                  </CardContent>
                </Card>
              ))
            )}

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
              <span className="text-red-600 dark:text-red-400">down</span> = no answer on a public route. Click a row for
              detail and to re-check a single service. The {s.inventory} inventory rows (private Twingate,
              source-owned/not-exposed, retired) can't be probed from this vantage — that's a portfolio fact, not an
              outage.
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
