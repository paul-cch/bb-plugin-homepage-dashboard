// The full homelab estate as probe/inventory targets.
//
// Source of truth (repo source, NOT live proof on its own):
//   - projects/homelab/runtime-truth-map.json  (28 portfolio entries)
//   - projects/homelab/infra/iris-m1/docs/network/INGRESS_HOSTNAME_INVENTORY.md
//   - projects/homelab/infra/iris-m1/docs/vms-and-backup/LIVE_GUEST_SERVICE_INVENTORY.md
//
// The dashboard represents the WHOLE estate, not a hand-picked few: every entry
// from the truth map appears here. `reach` decides how each is treated:
//   - "public":    unauthenticated health route → probed, a 2xx is real proof.
//   - "protected": public hostname behind Cloudflare Access / app auth → probed
//                  for reachability only (an auth wall means ingress is live).
//   - "private":   Twingate .iris.sys route → inventory only (vantage limit).
//   - "none":      source-owned / not-exposed → no route to probe.
//   - "retired":   tombstoned / provenance → listed so the estate is complete.
//
// A target is only probed when it has a non-null `url` AND reach is public or
// protected. No secrets, tokens, or credentials are ever used.

import type { ProbeKind, ProbeReach } from "./runtime";

export type { ProbeKind, ProbeReach };

export interface ProbeTarget {
  /** Stable key used as a React list id and runtime map key. */
  id: string;
  /** Human label shown in the dashboard. */
  name: string;
  kind: ProbeKind;
  /** Host/VM or remote node this service lives on. */
  host: string;
  /** Portfolio status from the runtime truth map. */
  portfolio: string;
  /** Health route to probe, or null when there is no reachable route. */
  url: string | null;
  /** What a successful (or gated) probe proves, for transparency. */
  note: string;
  reach: ProbeReach;
}

export const HOMELAB_TARGETS: ProbeTarget[] = [
  // ── Services ────────────────────────────────────────────────────────────
  {
    id: "openclaw",
    name: "OpenClaw Gateway",
    kind: "service",
    host: "iris-m1 / LXC 111",
    portfolio: "active",
    url: "https://gw.iris-kernel.net/healthz",
    note: "OpenClaw gateway health route behind Cloudflare Access (truth-map: openclaw, protected-public).",
    reach: "protected",
  },
  {
    id: "haos",
    name: "Home Assistant",
    kind: "service",
    host: "iris-m1 / VM 103",
    portfolio: "active",
    url: "https://home.iris-kernel.net/manifest.json",
    note: "HAOS frontend manifest (truth-map: haos, public-app-auth).",
    reach: "public",
  },
  {
    id: "n8n",
    name: "n8n Workflows",
    kind: "service",
    host: "iris-m1 / VM 107",
    portfolio: "active",
    url: "https://automa.iris-kernel.net/healthz",
    note: "n8n container health behind Cloudflare Access (truth-map: n8n-workflows, protected-public).",
    reach: "protected",
  },
  {
    id: "vaultwarden",
    name: "Vaultwarden",
    kind: "service",
    host: "iris-m1",
    portfolio: "active",
    url: null,
    note: "Vaultwarden secrets custody; public ingress unverified in truth-map — inventory only, not probed.",
    reach: "none",
  },
  {
    id: "basic-memory",
    name: "Basic Memory",
    kind: "service",
    host: "iris-m1 / VM 108",
    portfolio: "active",
    url: "https://memory-core.iris.sys/health",
    note: "Basic Memory MCP; admin-only Twingate resource (truth-map: basic-memory, internal-only).",
    reach: "private",
  },
  {
    id: "hermes",
    name: "Hermes Operator",
    kind: "service",
    host: "iris-m1",
    portfolio: "active",
    url: null,
    note: "Primary Operator Assistant; not-exposed, source-owned runtime (truth-map: hermes).",
    reach: "none",
  },
  {
    id: "t730-arr-stack",
    name: "T730 *arr Media Stack",
    kind: "service",
    host: "T730",
    portfolio: "active",
    url: "https://prowlarr.iris-kernel.net/ping",
    note: "Prowlarr probed as the stack's representative (bazarr/prowlarr/qbit/radarr/sonarr, all one Cloudflare Access app) — truth-map: t730-arr-stack.",
    reach: "protected",
  },

  // ── Apps ────────────────────────────────────────────────────────────────
  {
    id: "codex-friend-chat",
    name: "Codex Friend Chat",
    kind: "app",
    host: "iris-m1 / VM 107",
    portfolio: "active",
    url: "https://codex.iris-kernel.net/",
    note: "Private VM107 friend chat behind Cloudflare Access (truth-map: codex-friend-chat).",
    reach: "protected",
  },
  {
    id: "codex-openai-shim",
    name: "Codex OpenAI Shim",
    kind: "app",
    host: "iris-m1 / VM 107",
    portfolio: "active",
    url: null,
    note: "Loopback OpenAI-compatible adapter for Friend Chat; private-only (truth-map: codex-openai-shim).",
    reach: "none",
  },
  {
    id: "searxng",
    name: "SearXNG Search",
    kind: "app",
    host: "iris-m1 / VM 107",
    portfolio: "active",
    url: null,
    note: "SearXNG deployed healthy 2026-07-31; ingress not-exposed (truth-map: searxng-search).",
    reach: "none",
  },
  {
    id: "tend-daily-os",
    name: "Tend Daily OS",
    kind: "app",
    host: "source-owned pilot",
    portfolio: "pilot",
    url: null,
    note: "Iris Daily OS attention/review pilot; not-exposed, no live Mac activation (truth-map: tend-daily-os).",
    reach: "none",
  },
  {
    id: "lifeos-ledger",
    name: "LifeOS Ledger",
    kind: "app",
    host: "source-owned",
    portfolio: "source-only",
    url: null,
    note: "LifeOS coordination ledger; source-owned, not-exposed (truth-map: lifeos-ledger).",
    reach: "none",
  },
  {
    id: "operations-cockpit",
    name: "Operations Cockpit",
    kind: "app",
    host: "source-owned",
    portfolio: "source-only",
    url: null,
    note: "Personal-operations cockpit; source-owned, not-exposed (truth-map: personal-operations-cockpit).",
    reach: "none",
  },
  {
    id: "open-source-scout",
    name: "Open Source Scout",
    kind: "app",
    host: "source-owned",
    portfolio: "source-only",
    url: null,
    note: "OSS discovery app; source-owned, not-exposed (truth-map: open-source-scout).",
    reach: "none",
  },
  {
    id: "notion-tasks-ios",
    name: "Notion Tasks iOS",
    kind: "app",
    host: "iOS Shortcuts",
    portfolio: "paused",
    url: null,
    note: "iOS task bridge; ingress blocked, work paused (truth-map: notion-tasks-ios).",
    reach: "none",
  },
  {
    id: "private-app-deployment",
    name: "Private App Deployment",
    kind: "app",
    host: "source-owned",
    portfolio: "source-only",
    url: null,
    note: "Deployment scaffold; source-owned, not-exposed (truth-map: private-app-deployment).",
    reach: "none",
  },

  // ── Remote nodes (BigBoy / Oracle) ────────────────────────────────────────
  {
    id: "immich",
    name: "Immich Photos",
    kind: "remote",
    host: "BigBoy / VM 121",
    portfolio: "active",
    url: "https://photos.iris-kernel.net/api/server/ping",
    note: "Immich /api/server/ping returned 200 unauth 2026-07-16 (truth-map: bigboy-immich).",
    reach: "public",
  },
  {
    id: "seafile",
    name: "Seafile Files",
    kind: "remote",
    host: "BigBoy",
    portfolio: "active",
    url: "https://files.iris-kernel.net/",
    note: "Seafile public route returned normal 302 2026-07-16 (truth-map: bigboy-seafile).",
    reach: "protected",
  },
  {
    id: "blog",
    name: "Oracle ARM Utilities",
    kind: "remote",
    host: "Oracle ARM",
    portfolio: "active",
    url: "https://blog.iris-kernel.net/healthz",
    note: "Oracle ARM utility/blog route behind Cloudflare Access (truth-map: oracle-arm-utilities, protected-public).",
    reach: "protected",
  },
  {
    id: "kaneo",
    name: "Kaneo",
    kind: "remote",
    host: "BigBoy / VM 123",
    portfolio: "active",
    url: "https://kaneo.iris.sys/api/health",
    note: "Kaneo /api/health returned {status:ok} 2026-08-04; private-only Twingate (truth-map: bigboy-kaneo).",
    reach: "private",
  },
  {
    id: "gitea",
    name: "Gitea",
    kind: "remote",
    host: "BigBoy / VM 123",
    portfolio: "active",
    url: "https://gitea.iris.sys/api/healthz",
    note: "Gitea /api/healthz returned pass 2026-08-04; private-only Twingate (truth-map: bigboy-gitea).",
    reach: "private",
  },

  // ── Infra ────────────────────────────────────────────────────────────────
  {
    id: "ingress",
    name: "IrisCloud Ingress",
    kind: "infra",
    host: "Cloudflare tunnel",
    portfolio: "active",
    url: null,
    note: "IrisCloud Cloudflare tunnel keep-list; liveness implied by any public probe above (truth-map: ingress).",
    reach: "none",
  },

  // ── Retired / provenance (kept so the estate is complete) ─────────────────
  {
    id: "recall-lens-studio",
    name: "Recall Lens Studio",
    kind: "app",
    host: "retired",
    portfolio: "retired/provenance",
    url: null,
    note: "Retired; kept for provenance (truth-map: recall-lens-studio).",
    reach: "retired",
  },
  {
    id: "paperclip-homelab",
    name: "Paperclip Homelab",
    kind: "app",
    host: "retired",
    portfolio: "retired/provenance",
    url: null,
    note: "Retired; kept for provenance (truth-map: paperclip-homelab).",
    reach: "retired",
  },
  {
    id: "iris-dashboard",
    name: "Iris Dashboard (legacy)",
    kind: "app",
    host: "retired",
    portfolio: "retired/provenance",
    url: null,
    note: "Retired legacy dashboard; kept for provenance (truth-map: iris-dashboard).",
    reach: "retired",
  },
  {
    id: "ruviview-aggregator",
    name: "RuviView Aggregator",
    kind: "app",
    host: "retired",
    portfolio: "retired/provenance",
    url: null,
    note: "Unverified/retired aggregator; kept for provenance (truth-map: ruviview-aggregator).",
    reach: "retired",
  },
  {
    id: "bigboy-rackpad",
    name: "BigBoy Rackpad",
    kind: "remote",
    host: "BigBoy",
    portfolio: "retired/provenance",
    url: null,
    note: "Retired; route tombstoned (truth-map: bigboy-rackpad).",
    reach: "retired",
  },
  {
    id: "bigboy-zennotes",
    name: "BigBoy ZenNotes",
    kind: "remote",
    host: "BigBoy",
    portfolio: "retired/provenance",
    url: null,
    note: "Retired; route tombstoned (truth-map: bigboy-zennotes).",
    reach: "retired",
  },
];
