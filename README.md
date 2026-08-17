# bb-plugin-homepage-dashboard

A BB plugin that surfaces **live runtime state of the running bb instance**
on the homepage and in a dedicated dashboard panel.

## What it shows

A single snapshot of everything currently running in your bb:

- **Server** — bb version + whether the server is requesting attention.
- **Projects** — count and per-project kind/git/source info.
- **Threads** — total plus an active / idle / error / other breakdown, and the
  most recently updated threads (clickable to open).
- **Hosts** — count and connection status.
- **Providers** — available model providers.
- **Plugins** — every loaded plugin with version and provenance (builtin /
  direct / catalog), flagging orphaned builtins and available updates.

## How it stays live

- A background **`snapshot-poller`** service refreshes the snapshot every
  20 seconds and when an entity changes (thread / project / host / system),
  then broadcasts a realtime signal so the UI pulls a fresh copy without
  polling.
- The frontend keeps two surfaces in sync from the same RPC:
  - a compact **`homepageSection`** ("Runtime state") on the compose surface,
  - a full **`navPanel`** ("Runtime Dashboard") at
    `/plugins/homepage-dashboard/dashboard`.

## CLI

```sh
bb homepage-dashboard snapshot   # compact live runtime snapshot in the terminal
```

Useful for agents and quick checks without opening the UI.

## Architecture

- `server.ts` — backend factory: builds the snapshot from `bb.sdk`, registers
  the `getSnapshot` RPC, the poller service, and the CLI command. Defensive
  per-area `safe()` wrappers mean one failing SDK call degrades to an empty
  list plus a surfaced error rather than breaking the whole dashboard.
- `app.tsx` — frontend: `useRpc` + `useRealtime` + reconnect reconciliation.
- `lib/runtime.ts` — shared, serializable snapshot types (no backend-only
  imports) so the server and the bundle stay in sync without leaking
  implementation.

> Note: bb's terminals API requires an explicit scope (thread / environment /
> host_path) with no global list, so a single global terminal count is not
> available through the SDK and is intentionally omitted.

## Install / update

Installed here from git (public repo, no secrets in source):

```sh
bb plugin install git:https://github.com/paul-cch/bb-plugin-homepage-dashboard.git
```

After pushing changes:

```sh
bb plugin update homepage-dashboard --yes
bb plugin reload homepage-dashboard
```
