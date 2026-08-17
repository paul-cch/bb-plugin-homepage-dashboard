// Curated, read-only live probe targets for the homelab estate.
//
// Sources of truth (repo source, NOT live proof on their own):
//   - projects/homelab/runtime-truth-map.json
//   - projects/homelab/infra/iris-m1/docs/vms-and-backup/LIVE_GUEST_SERVICE_INVENTORY.md
//
// `reach` controls HOW the plugin treats the target:
//   - "public":    a Cloudflare/public route the bb server CAN reach — probed for real.
//   - "twingate":  a Twingate-private (.iris.sys) or not-exposed route the bb
//                  server cannot see from its vantage — shown as inventory only,
//                  never a misleading "down". (From the bb server's network
//                  these DNS-resolve to nothing; that is a vantage limit, not an
//                  outage.)
//
// Every probed target uses a documented unauthenticated health route. No
// secrets, tokens, or credentials are involved.

export type ProbeKind =
  | "app"
  | "service"
  | "infra"
  | "remote"
  | "operator";

export type ProbeReach = "public" | "twingate";

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
  /** Whether the bb server can actually reach this endpoint. */
  reach: ProbeReach;
}

export const HOMELAB_TARGETS: ProbeTarget[] = [
  {
    id: "openclaw",
    name: "OpenClaw",
    kind: "service",
    host: "iris-m1 / LXC 111",
    url: "https://gw.iris-kernel.net/healthz",
    note: "Live OpenClaw gateway health route (runtime-truth-map: OpenClaw).",
    reach: "public",
  },
  {
    id: "haos",
    name: "Home Assistant",
    kind: "service",
    host: "iris-m1 / VM 103",
    url: "https://home.iris-kernel.net/manifest.json",
    note: "HAOS frontend manifest (runtime-truth-map: haos, public-app-auth).",
    reach: "public",
  },
  {
    id: "n8n",
    name: "n8n Workflows",
    kind: "service",
    host: "iris-m1 / VM 107",
    url: "https://automa.iris-kernel.net/healthz",
    note: "n8n container health (runtime-truth-map: n8n-workflows).",
    reach: "public",
  },
  {
    id: "immich",
    name: "BigBoy Immich",
    kind: "remote",
    host: "BigBoy / VM 121",
    url: "https://photos.iris-kernel.net/",
    note: "Immich web root liveness; unauthenticated ping returned pong 2026-07-16.",
    reach: "public",
  },
  {
    id: "blog",
    name: "Oracle Blog",
    kind: "remote",
    host: "Oracle ARM",
    url: "https://blog.iris-kernel.net/healthz",
    note: "Oracle ARM utility/blog route (runtime-truth-map: oracle-arm-utilities).",
    reach: "public",
  },
  {
    id: "basic-memory",
    name: "Basic Memory",
    kind: "service",
    host: "iris-m1 / VM 108",
    url: "https://memory-core.iris.sys/health",
    note: "Basic Memory MCP; admin-only Twingate resource (runtime-truth-map: basic_memory).",
    reach: "twingate",
  },
  {
    id: "searxng",
    name: "SearXNG Search",
    kind: "app",
    host: "iris-m1 / VM 107",
    url: "https://iris-kernel.net/searxng/healthz",
    note: "SearXNG; release 68de076f deployed healthy 2026-07-31, ingress not-exposed.",
    reach: "twingate",
  },
  {
    id: "kaneo",
    name: "BigBoy Kaneo",
    kind: "remote",
    host: "BigBoy / VM 123",
    url: "https://kaneo.iris.sys/api/health",
    note: "Kaneo /api/health returned {status:ok} 2026-08-04 (private-only Twingate).",
    reach: "twingate",
  },
  {
    id: "gitea",
    name: "BigBoy Gitea",
    kind: "remote",
    host: "BigBoy / VM 123",
    url: "https://gitea.iris.sys/api/healthz",
    note: "Gitea /api/healthz returned pass 2026-08-04 (private-only Twingate).",
    reach: "twingate",
  },
];
