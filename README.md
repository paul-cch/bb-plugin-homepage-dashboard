# bb-plugin-homepage-dashboard

A BB plugin that surfaces the **live state of the homelab estate** on the
homepage and in a dedicated dashboard panel — real HTTP health probes of the
services, VMs, and remote nodes, not just source claims.

## What it shows

A live snapshot of what is actually **up** on the estate right now:

- **OpenClaw** — live gateway health (iris-m1 / LXC 111)
- **Home Assistant** — HAOS frontend liveness (iris-m1 / VM 103)
- **n8n Workflows** — container health (iris-m1 / VM 107)
- **BigBoy Immich** — web liveness (BigBoy / VM 121)
- **Oracle Blog** — utility/blog route (Oracle ARM)
- **Private routes (inventory only)** — Basic Memory, SearXNG, BigBoy Kaneo,
  BigBoy Gitea live on Twingate-private (`.iris.sys`) or not-exposed routes
  that the bb server cannot reach from its vantage, so they are listed as
  inventory rather than probed. They are clearly badged `private` so a blank
  here is a vantage limit, **not** an outage.

Each probe shows status (up / down / timeout / private), round-trip latency,
and the host/VM it runs on. Results are grouped by host node.

## Why this is honest

The homelab repo's runtime truth map and live inventory are **source claims**,
not live proof. This plugin does the extra step: it actually `fetch`es each
service's documented unauthenticated health route from the bb server (which
sits on Paul's network). A green dot means the service *answered*, independent
of what the repo says should be up. No secrets or tokens are used — only the
same public health pings the estate's own read-only inventories used.

The bb SDK exposes no host/SSH surface (its `hosts` are remote dev machines,
not the Proxmox estate), so estate reachability is measured purely by network
probes.

## How it stays live

- A background **`snapshot-poller`** service probes every target every 30
  seconds, then broadcasts a realtime signal so the UI pulls a fresh copy
  without polling.
- The frontend keeps two surfaces in sync from the same RPC:
  - a compact **`homepageSection`** ("Homelab — Live") on the compose surface,
  - a full **`navPanel`** ("Homelab — Live") at
    `/plugins/homepage-dashboard/dashboard`.

## CLI

```sh
bb homepage-dashboard snapshot   # compact live-state snapshot in the terminal
```

Useful for agents and quick checks without opening the UI.

## Architecture

- `lib/homelab-endpoints.ts` — curated probe targets, sourced from
  `projects/homelab/runtime-truth-map.json` and the live guest/service
  inventory. Each target carries a `reach` flag (`public` vs `twingate`).
- `server.ts` — backend: fans out concurrent HTTPS probes with a per-target
  timeout (6s), marks Twingate-private targets as inventory-only, rolls up
  counts against the **reachable** denominator, registers the `getSnapshot`
  RPC, the poller service, and the CLI command.
- `app.tsx` — frontend: `useRpc` + `useRealtime` + reconnect reconciliation.
- `lib/runtime.ts` — shared serializable snapshot types (no backend-only
  imports) so the server and bundle stay in sync.

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

## Adding or changing a monitored service

Edit `lib/homelab-endpoints.ts`: add an entry with `id`, `name`, `kind`,
`host`, `url` (an unauthenticated health route), `note`, and `reach`. Use
`reach: "twingate"` for any `.iris.sys` or not-exposed route the bb server
cannot reach. No other file needs to change — the poller, CLI, and UI pick it
up automatically.
