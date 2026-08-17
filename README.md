# bb-plugin-homepage-dashboard

A BB plugin that represents the **full homelab estate** on the homepage and in
a dedicated dashboard panel — every entry from the runtime truth map, grouped
by category, with real HTTP health probes of what's publicly reachable and
honest inventory for everything else. Not just source claims, and not just a
hand-picked few.

## What it shows

The whole portfolio — **28 entries** across five sections:

- **Core services** — OpenClaw, Home Assistant, n8n, Basic Memory, Hermes,
  T730 *arr media stack…
- **Apps** — Codex Friend Chat, SearXNG, Tend Daily OS, LifeOS Ledger,
  Operations Cockpit, Open Source Scout…
- **Remote nodes** — Immich, Seafile, Kaneo, Gitea (BigBoy), Oracle ARM
  utilities.
- **Infrastructure** — the IrisCloud Cloudflare tunnel keep-list.
- **Retired / provenance** — tombstoned services kept so the estate is complete.

Each row carries its host/VM, portfolio status (active / pilot / source-only /
retired), and a reach badge. The dashboard **probes what it can reach** and is
honest about the rest:

- **up** (green) — answered a 2xx health route.
- **gated** (violet) — the public edge answered but sits behind Cloudflare
  Access from the bb server's vantage (a redirect / 401 / 403). The ingress is
  live; the app just isn't unauth-visible. Not an outage.
- **down** (red) — no answer on a route that *should* be public (a real signal,
  e.g. a 410/502 from an origin).
- **inventory** (muted) — private Twingate (`.iris.sys`), source-owned /
  not-exposed, or retired routes the bb server cannot see from its vantage.
  Listed with their portfolio status so a blank is a **portfolio fact, not an
  outage**.

KPIs roll up estate size, live/probed reachability, down count, and inventory
breakdown. The compact homepage section mirrors the same data.

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

- `lib/homelab-endpoints.ts` — the full estate as targets, one per entry in
  `projects/homelab/runtime-truth-map.json`, cross-checked against the ingress
  and live guest/service inventories. Each target carries a `reach` flag
  (`public` / `protected` / `private` / `none` / `retired`) and its `portfolio`
  status.
- `server.ts` — backend: fans out concurrent HTTPS probes (6s timeout) for
  `public`/`protected` targets, treats redirects and auth walls as `gated`
  rather than `down`, lists everything else as inventory, rolls up counts,
  registers the `getSnapshot` RPC, the poller service, and the CLI command.
- `app.tsx` — frontend: sections the estate by category, renders portfolio and
  reach badges, KPIs, and the compact homepage section. `useRpc` +
  `useRealtime` + reconnect reconciliation.
- `lib/runtime.ts` — shared serializable snapshot types (no backend-only
  imports) so the server and bundle stay in sync.
- `viewer/` — a self-contained standalone viewer (`server.py` + `index.html`)
  that renders the same snapshot outside the bb app.

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
`host`, `portfolio`, `url`, `note`, and `reach`. Pick `reach`:

- `public` — an unauthenticated 2xx health route the bb server can reach.
- `protected` — a public hostname behind Cloudflare Access / app auth (probed
  for reachability; a redirect / 401 / 403 reads as `gated`).
- `private` — a `.iris.sys` Twingate route (inventory only; set `url` for
  reference).
- `none` — source-owned / not-exposed (set `url: null`).
- `retired` — tombstoned / provenance (set `url: null`).

No other file needs to change — the poller, CLI, and UI pick it up
automatically.
