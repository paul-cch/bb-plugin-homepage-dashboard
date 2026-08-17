// Curated, read-only live probe targets for the homelab estate.
//
// Sources of truth (repo source, NOT live proof on their own):
//   - projects/homelab/runtime-truth-map.json
//   - projects/homelab/infra/iris-m1/docs/vms-and-backup/LIVE_GUEST_SERVICE_INVENTORY.md
//
// Every target below has a documented HTTP health endpoint in those sources.
// The plugin PROBES each one for real reachability; a green dot means the
// service actually answered from the bb server's network, not that the source
// claims it should be up. Targets without a clear pathless health route are
// deliberately left out so we never show a fabricated "live" reading.
//
// No secrets, tokens, or credentials are used: these are unauthenticated
// health pings (the same kind the estate's own read-only inventories used).

export type ProbeKind =
  | "app"
  | "service"
  | "infra"
  | "remote"
  | "operator"; // the operator runtime itself (Hermes/OpenClaw)

export interface ProbeTarget {
  /** Stable key used as a React list id and runtime map key. */
  id: string;
  /** Human label shown in the dashboard. */
  name: string;
  kind: ProbeKind;
  /** Host/VM or remote node this service lives on. */
  host: string;
  /** Full URL to probe (HTTPS, unauthenticated health route). */
  url: string;
  /** What a successful probe proves, for transparency. */
  note: string;
}

export const HOMELAB_TARGETS: ProbeTarget[] = [
  {
    id: "openclaw",
    name: "OpenClaw",
    kind: "service",
    host: "iris-m1 / LXC 111",
    url: "https://gw.iris-kernel.net/healthz",
    note: "Live OpenClaw gateway health route (runtime-truth-map: OpenClaw).",
  },
  {
    id: "basic-memory",
    name: "Basic Memory",
    kind: "service",
    host: "iris-m1 / VM 108",
    url: "https://memory-core.iris.sys/health",
    note: "Basic Memory MCP streamable-HTTP health (runtime-truth-map: basic_memory).",
  },
  {
    id: "haos",
    name: "Home Assistant",
    kind: "service",
    host: "iris-m1 / VM 103",
    url: "https://home.iris-kernel.net/manifest.json",
    note: "HAOS frontend manifest (runtime-truth-map: haos, public-app-auth).",
  },
  {
    id: "n8n",
    name: "n8n Workflows",
    kind: "service",
    host: "iris-m1 / VM 107",
    url: "https://automa.iris-kernel.net/healthz",
    note: "n8n container health (runtime-truth-map: n8n-workflows).",
  },
  {
    id: "searxng",
    name: "SearXNG Search",
    kind: "app",
    host: "iris-m1 / VM 107",
    url: "https://iris-kernel.net/searxng/healthz",
    note: "SearXNG health route; release 68de076f deployed healthy 2026-07-31.",
  },
  {
    id: "kaneo",
    name: "BigBoy Kaneo",
    kind: "remote",
    host: "BigBoy / VM 123",
    url: "https://kaneo.iris.sys/api/health",
    note: "Kaneo /api/health returned {status:ok} 2026-08-04.",
  },
  {
    id: "gitea",
    name: "BigBoy Gitea",
    kind: "remote",
    host: "BigBoy / VM 123",
    url: "https://gitea.iris.sys/api/healthz",
    note: "Gitea /api/healthz returned status pass 2026-08-04.",
  },
  {
    id: "immich",
    name: "BigBoy Immich",
    kind: "remote",
    host: "BigBoy / VM 121",
    url: "https://photos.iris-kernel.net/api/server-info/ping",
    note: "Immich unauthenticated ping returned {res:pong} 2026-07-16.",
  },
  {
    id: "blog",
    name: "Oracle Blog",
    kind: "remote",
    host: "Oracle ARM",
    url: "https://blog.iris-kernel.net/healthz",
    note: "Oracle ARM utility/blog route (runtime-truth-map: oracle-arm-utilities).",
  },
];
