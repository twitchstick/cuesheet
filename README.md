<p align="center">
  <img src="docs/logo.svg" width="88" alt="Cuesheet">
</p>

<h1 align="center">Cuesheet</h1>

<p align="center">A calm media dashboard for Plex, Jellyfin, Radarr, Sonarr and Seerr.</p>

<p align="center">
  <a href="https://github.com/twitchstick/cuesheet/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/twitchstick/cuesheet?label=release&color=7c5cff"></a>
  <a href="https://github.com/twitchstick/cuesheet/actions/workflows/docker.yml"><img alt="Build status" src="https://github.com/twitchstick/cuesheet/actions/workflows/docker.yml/badge.svg"></a>
  <a href="https://github.com/twitchstick/cuesheet/pkgs/container/cuesheet"><img alt="Container image" src="https://img.shields.io/badge/ghcr.io-cuesheet-22d3ee"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/twitchstick/cuesheet?color=8b91a5"></a>
</p>

<p align="center">
  <sub>Built by <a href="https://github.com/twitchstick">twitchstick</a> · written with <a href="https://claude.com/claude-code">Claude Code</a></sub>
</p>

Everything worth knowing about a home media server on one page: what is playing
right now, what arrived recently, what is due this week, and a box to ask for
something new. It runs in Docker, sets itself up from a wizard in the browser,
and keeps every API key on the server.

- **Now Playing** – the front page leads with it: every active Plex and Jellyfin stream with poster, user, player, progress, direct/transcode, resolution and bandwidth, each tinted in its server's own colour.
- **Recently Added** – a scrolling poster row merged from Plex and Jellyfin, newest first, as long as you like.
- **Release calendar** – Radarr movie releases (cinema / digital / physical) and Sonarr episode air dates, with a check mark on anything already downloaded. The front page shows the week ahead; the Release Calendar tab shows a whole month and switches between them. Busy days scroll inside their own cell rather than stretching the row.
- **Requests, traced end to end** – what the house has asked for through Overseerr or Jellyseerr, followed as one continuous thread from *requested* through *monitored*, *downloading*, *importing* to *available* — not four separate glances across four separate tools. A title that's stuck says why, in Radarr/Sonarr's own words, right on the card. Requesting itself still happens in Seerr: the *Request media* button opens it in a new tab. The front page shows a quiet summary — how many are waiting, moving, landed — that opens onto the full page; a title that actually needs a look is pulled up and shown right there.
- **Bandwidth** – what all the streaming is costing the server, split between remote and local, with a figure on every stream.
- **Details on click** – open any poster or release for its synopsis, runtime, genres, cast and crew; open a stream for its signal path — codecs in and out, resolution, container, subtitles, and why it is transcoding.
- **Download queue, live** – the same trace Requests uses, for whatever Radarr and Sonarr are actively fetching right now, whether or not it came from a request. Progress creeps forward between refreshes instead of jumping once a poll lands. Failed, stalled and paused items say so plainly rather than reading as a generic "downloading." Add SABnzbd and a slim strip above the queue shows current speed from whichever download client you actually use.
- **Quick links** – a row of squares for anything else on your network — Unraid's own UI, Portainer, Tautulli, whatever else you'd otherwise bookmark separately. Add a name and an address; the icon is the site's own favicon by default, with a small curated set to fall back on, or point it at any icon of your own — a self-hosted [selfh.st/icons](https://selfh.st/icons/) mirror, say.

Every service is optional: configure what you have and the rest of the page simply doesn't render. All API keys stay inside the container, and artwork from your own servers is proxied through Cuesheet so the browser never holds a credential. Request artwork is the one exception: it comes straight from TMDB, as it does in Overseerr.

There is no sign-in. Anyone who can reach the page sees the dashboard and can open Settings, so keep it on your own network.

![Cuesheet](docs/screenshot.png)

## Setup wizard

Everything about your services is configured inside Cuesheet, not on the container. On first run the app opens a setup wizard: enter each service's URL and key, hit *Test connection* to confirm it (Jellyfin and Seerr also let you pick a user from a list), and save. Settings are written to `settings.json` in the data directory (`/config` in the container). Reopen it any time from *Settings* in the sidebar.

The first step also sets *Your name* for the greeting, *Server name* for the small label above it, and how many posters the *Recently added* row holds.

## Running on Unraid (Apollo)

### Option A – template (recommended)

1. Copy `unraid/cuesheet.xml` to `/boot/config/plugins/dockerMan/templates-user/` on Apollo (via the flash share or `scp`).
2. Docker tab → **Add Container** → pick **Cuesheet** from the *Template* dropdown.
3. Leave the *Config Folder* at `/mnt/user/appdata/cuesheet`. There is nothing else to fill in — your services are added inside the app.
4. Apply. Open `http://apollo:3000` and follow the setup wizard (see [Credentials](#credentials) for where each key lives).

The template pulls `ghcr.io/twitchstick/cuesheet:latest`, which is built automatically by the GitHub Actions workflow in this repo on every push to `main` (and tagged releases like `v1.0.0`). If the package is private on GHCR, either make it public in the package settings or log in to GHCR on Apollo first.

### Option B – build the image on Apollo

If you'd rather not depend on GHCR:

```sh
git clone https://github.com/twitchstick/cuesheet.git /mnt/user/appdata/cuesheet-src
cd /mnt/user/appdata/cuesheet-src
docker build -t cuesheet:local .
```

Then add a container in the Unraid UI with repository `cuesheet:local` (or import the template and change the *Repository* field), map `/config` to `/mnt/user/appdata/cuesheet`, and open the web UI to run the wizard.

### Option C – docker compose

```sh
cp .env.example .env   # fill in your values
docker compose up -d --build
```

## Updating

Releases are listed on the [releases page](https://github.com/twitchstick/cuesheet/releases)
with notes taken from the [changelog](CHANGELOG.md). Every push to `main` also
republishes `latest`, so you can follow either the moving tag or a pinned one:

| Tag | What you get |
| --- | --- |
| `latest` | The newest build from `main`. |
| `1.0.0` | An exact release, pinned. |
| `1.0` | The newest patch of that minor version. |

On Unraid, use **Check for Updates** on the Cuesheet container and then **Apply
Update**. From a terminal it is `docker pull ghcr.io/twitchstick/cuesheet:latest`
followed by a restart. Your `settings.json` in the config folder is untouched by
an update.

## Credentials

| Service | Where to find it |
| --- | --- |
| `PLEX_TOKEN` | Plex Web → any item → ⋯ → *Get Info* → *View XML*, copy `X-Plex-Token=` from the URL. |
| `JELLYFIN_API_KEY` | Jellyfin → Dashboard → API Keys → + |
| `JELLYFIN_USER_ID` (optional) | Dashboard → Users → pick a user → the id in the URL. When set, Recently Added uses that user's grouped "latest" view. |
| `RADARR_API_KEY` / `SONARR_API_KEY` | Settings → General → Security → API Key |
| `SEERR_API_KEY` | Overseerr/Jellyseerr → Settings → General → API Key |
| `SEERR_USER_ID` (optional) | Requests are created as the API key's owner unless this is set to another Seerr user id. |
| `SABNZBD_API_KEY` | SABnzbd → Config → General → API Key |

These names are the environment variables, which exist for docker compose users. On Unraid you enter the same values in the setup wizard instead.

Use LAN addresses on Apollo (for example `http://192.168.1.10:32400`), or `http://<container-name>:<port>` if the containers share a custom Docker network.

All environment variables are listed in `.env.example`. They are optional once the wizard has been used; a value saved in the wizard wins over the matching variable. The app's name is fixed and not configurable.

The container starts as root only to make `/config` owned by `PUID:PGID` (defaults `99:100`, Unraid's `nobody:users`), then drops to that user.

## Security

Cuesheet has no accounts and no sign-in: anyone who can open the page sees the
dashboard and can change its settings. It is built to sit on a home network
behind your router, not on the open internet.

What it still does carefully:

- **Credentials stay server-side.** Service keys live in `settings.json`
  (mode `0600`) inside the config volume and are never returned to the browser —
  the settings API reports only whether a key is set.
- **Credentials can skip the settings file entirely.** Set `RADARR_API_KEY`,
  `PLEX_TOKEN` and the like as plain environment variables, or as Docker/Compose
  secrets via `RADARR_API_KEY_FILE=/run/secrets/radarr_api_key` (any `*_FILE`
  variable wins over its plain counterpart if both are set) — configure
  everything this way and the setup wizard never has to write anything to disk.
- **Artwork from your servers is proxied**, so the browser never holds a
  credential, the proxy only ever returns a bitmap, and it caps how much it
  will pull down. Request artwork loads from TMDB in the browser, the same as
  Overseerr does it.
- **Link-local addresses are refused.** Cuesheet talks to private addresses by
  design, but `169.254.0.0/16` and the cloud metadata hostnames are blocked, so
  the open connection test cannot be turned into a probe for them. Redirects
  are followed by Cuesheet itself and every hop is re-checked.
- **Every response from a configured service is capped**, not just artwork —
  a Plex, Radarr, Sonarr, Seerr or SABnzbd instance that hands back an
  oversized or malformed body can't run the server out of memory.
- **Cross-site writes are rejected.** A settings change arriving with another
  site's Origin is refused, which closes the drive-by and DNS-rebinding routes
  into an app with no sign-in.
- **A connection test will not send a stored key to a different host.**
  Retesting a saved service reuses its key only when the URL still points at
  that same server.
- **Response headers** set a content security policy, `nosniff`,
  `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`.
- **Quick links are navigation, not a fetch.** Cuesheet's server never
  requests them — clicking one is your browser opening a new tab, exactly
  like typing the address yourself — but the address is still checked on
  save so it can only be an `http://` or `https://` link.

What is left to you:

- **Do not expose it to the internet.** With no sign-in, anyone who reaches the
  page can read your service settings and change them. Use a VPN, or put it
  behind a reverse proxy that does its own authentication.
- **There is no HTTPS.** Terminate TLS at a reverse proxy if it leaves your LAN.

Run `npm audit` in both the root and `client/` after changing dependencies;
both are expected to report zero vulnerabilities.

## Development

```sh
npm run install:all   # server + client deps
cp .env.example .env  # point at your services
npm run dev           # server on :3000, Vite client on :5173 (proxied to /api)
```

`npm run build` builds the client into `client/dist`; `npm start` serves it from the Express server.

## How it works

- `server/` – Express. One adapter per service under `server/services/`. `/api/streams`, `/api/recent` and `/api/calendar` fan out to every configured source and return `{ items, errors }`, so a single unreachable service shows a small warning instead of breaking the page. Responses are cached briefly (5 s for streams, minutes for the rest) and stale data is served if an upstream errors.
- `/api/image` – proxies posters from Plex, Jellyfin, Radarr and Sonarr so credentials are never sent to the browser. Request results use public TMDB poster URLs.
- `/api/settings` – read (secrets masked), update and test connections from the setup wizard; `server/config.js` merges env defaults with `settings.json`.
- `client/` – React + Vite + Tailwind. Polling pauses when the tab is hidden and resumes immediately when it becomes visible, which suits a wall-mounted display.

## Project

- [Changelog](CHANGELOG.md) — what changed in each release.
- [Security policy](SECURITY.md) — how to report a problem, and what Cuesheet
  does and does not protect against.
- [MIT licensed](LICENSE).

Built and maintained by [twitchstick](https://github.com/twitchstick). The code
was written with [Claude Code](https://claude.com/claude-code), which is
credited as a co-author on each commit.
