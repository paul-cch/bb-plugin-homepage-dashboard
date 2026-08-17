// Shared, serializable shapes for the live homelab dashboard snapshot.
// Kept free of backend-only imports so both the server (builder) and the
// frontend (renderer) can depend on it. Every field is a primitive so the
// object survives JSON wire serialization.

export type ProbeKind =
  | "app"
  | "service"
  | "infra"
  | "remote"
  | "operator";

export type ProbeStatus =
  | "up" // responded with a 2xx status in time
  | "down" // responded with a non-2xx status, or DNS/TLS/connection error
  | "timeout" // exceeded the probe budget
  | "unverified"; // no reachable health route documented; source claim only

export interface ProbeResult {
  id: string;
  name: string;
  kind: ProbeKind;
  host: string;
  url: string;
  note: string;
  /** Final live status for this probe. */
  status: ProbeStatus;
  /** HTTP status code when we got an HTTP response, else null. */
  httpStatus: number | null;
  /** Milliseconds the probe took (round-trip), or null on failure. */
  latencyMs: number | null;
  /** Short human reason when not up (error class or status). */
  detail: string | null;
}

export interface HomelabSnapshot {
  /** Epoch ms when the probe batch finished. */
  generatedAt: number;
  /** How long the slowest single probe took (ms). */
  slowestMs: number;
  /** Non-fatal area errors (e.g. fetch unavailable), for transparency. */
  errors: string[];
  /** Per-target live probe results. */
  probes: ProbeResult[];
  /** Roll-up counts derived on the server. */
  summary: {
    total: number;
    up: number;
    down: number;
    timeout: number;
    unverified: number;
  };
}

// Loose structural views of SDK results used by the legacy bb-runtime
// surface (kept so the backend never drags SDK types into the frontend).
export const REALTIME_CHANNEL = "homepage-dashboard:snapshot";
