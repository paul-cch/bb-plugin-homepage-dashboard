// Shared, serializable shapes for the runtime dashboard snapshot.
// Kept free of backend-only imports so both the server (builder) and the
// frontend (renderer) can depend on it. Every field is a primitive so the
// object survives JSON wire serialization and z.unknown() validation.

export interface ServerSummary {
  version: string;
  hasAttention: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  kind: string; // "standard" | "personal"
  gitRemoteUrl: string | null;
  sourceCount: number;
}

export interface ThreadRow {
  id: string;
  title: string | null;
  status: string; // active | idle | error | stopping | starting
  projectId: string;
  providerId: string;
  environmentId: string | null;
  updatedAt: number; // epoch ms, 0 when unknown
}

export interface ThreadSummary {
  total: number;
  active: number;
  idle: number;
  error: number;
  other: number;
  recent: ThreadRow[];
}

export interface HostSummary {
  id: string;
  name: string;
  type: string; // persistent | ...
  status: string; // connected | disconnected | ...
}

// Note: bb's terminals API requires an explicit scope (thread / environment /
// host_path) and has no global list, so a single global terminal count is not
// available through the SDK. The dashboard surfaces the other global surfaces
// instead.

export interface ProviderSummary {
  id: string;
  displayName: string;
  supportsServiceTier: boolean;
}

export interface PluginSummary {
  id: string;
  source: string; // builtin:... | path:... | git:... | npm:...
  provenance: string;
  version: string;
  isOrphanedBuiltin: boolean;
  updateOutcome: string | null;
}

export interface RuntimeSnapshot {
  generatedAt: number; // epoch ms
  errors: string[]; // non-fatal area errors, for transparency
  server: ServerSummary;
  projects: ProjectSummary[];
  threads: ThreadSummary;
  hosts: HostSummary[];
  providers: ProviderSummary[];
  plugins: PluginSummary[];
}

// Loose structural views of SDK results. The SDK DTOs vary across bb
// releases, so we map from these optional shapes rather than importing the
// exact SDK types (which would drag backend-only code into the frontend).
export interface ThreadLike {
  id?: string;
  title?: string | null;
  status?: string;
  projectId?: string;
  providerId?: string;
  environmentId?: string | null;
  updatedAt?: number;
}

export interface ProjectLike {
  id?: string;
  name?: string;
  kind?: string;
  gitRemoteUrl?: string | null;
  sources?: unknown[];
}

export interface HostLike {
  id?: string;
  name?: string;
  type?: string;
  status?: string;
}

export interface ProviderLike {
  id?: string;
  displayName?: string;
  capabilities?: { supportsServiceTier?: boolean };
}

export interface PluginLike {
  id?: string;
  source?: string;
  provenance?: string;
  version?: string;
  isOrphanedBuiltin?: boolean;
  updateState?: { outcome?: string } | null;
}

export const REALTIME_CHANNEL = "homepage-dashboard:snapshot";
