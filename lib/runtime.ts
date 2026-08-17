// Shared, serializable shapes for the live homelab estate snapshot.
// Kept free of backend-only imports so both the server (builder) and the
// frontend (renderer) can depend on it. Every field is a primitive so the
// object survives JSON wire serialization.

// Where an estate entry lives in the portfolio, used for grouping.
export type ProbeKind =
  | "app"
  | "service"
  | "remote"
  | "infra";

// How the bb server can (or cannot) observe a target, which decides whether we
// probe it and how we read the result:
//   - "public":    unauthenticated health route the bb server can reach — a
//                  2xx is real proof the service answered.
//   - "protected": public hostname behind Cloudflare Access / app auth — we
//                  probe for reachability only; an auth wall (3xx/401/403)
//                  proves the ingress/tunnel is live, not that the app is.
//   - "private":   Twingate-internal (.iris.sys) route the bb server cannot
//                  see from its vantage — inventory only, never a false "down".
//   - "none":      source-owned / not-exposed — no ingress to probe at all.
//   - "retired":   tombstoned / provenance-only — kept for a complete estate.
export type ProbeReach = "public" | "protected" | "private" | "none" | "retired";

export type ProbeStatus =
  | "up" // answered a 2xx in time
  | "gated" // reachable but behind an auth wall (protected route)
  | "down" // non-2xx on a public route, or DNS/TLS/connection error
  | "timeout" // exceeded the probe budget
  | "inventory"; // not probed from here (private / source-only / retired)

export interface ProbeResult {
  id: string;
  name: string;
  kind: ProbeKind;
  /** Host/VM or remote node this service lives on. */
  host: string;
  /** Portfolio status from the runtime truth map (active, pilot, source-only…). */
  portfolio: string;
  /** URL that was (or would be) probed; null when there is no route. */
  url: string | null;
  /** What a result proves — transparency about proof class. */
  note: string;
  reach: ProbeReach;
  status: ProbeStatus;
  /** HTTP status code when we got an HTTP response, else null. */
  httpStatus: number | null;
  /** Milliseconds the probe took (round-trip), or null when not probed. */
  latencyMs: number | null;
  /** Short human reason for the status (error class, gate, or code). */
  detail: string | null;
}

export interface HomelabSnapshot {
  /** Epoch ms when the probe batch finished. */
  generatedAt: number;
  /** How long the slowest single probe took (ms). */
  slowestMs: number;
  /** Non-fatal area errors (e.g. fetch unavailable), for transparency. */
  errors: string[];
  /** Per-target result across the whole estate. */
  probes: ProbeResult[];
  /** Roll-up counts derived on the server. */
  summary: {
    /** Every estate entry, probed or not. */
    total: number;
    /** Entries we actually reached out to (public + protected with a route). */
    probed: number;
    up: number;
    gated: number;
    down: number;
    timeout: number;
    /** Entries listed as inventory only (private / source-only / retired). */
    inventory: number;
    /** Breakdown by reach class, for honest denominators. */
    reach: {
      public: number;
      protected: number;
      private: number;
      none: number;
      retired: number;
    };
    /** Entries whose portfolio status is "active". */
    active: number;
  };
}

export const REALTIME_CHANNEL = "homepage-dashboard:snapshot";
