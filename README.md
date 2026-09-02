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

Everything worth knowing about a home media server on one page: what is playing
right now, what arrived recently, what is due this week, and a box to ask for
something new. It runs in Docker, sets itself up from a wizard in the browser,
and keeps every API key on the server.

- **Now Playing** – active Plex and/or Jellyfin streams with poster, user, player, progress, direct/transcode and resolution.
- **Recently Added** – a poster row merged from Plex and Jellyfin, newest first.
- **This Week** – a 7-day calendar of Radarr movie releases (cinema / digital / physical) and Sonarr episode air dates, with a check mark on anything already downloaded. Step forward/back a week at a time.
- **Requests** – search and request movies or shows through Overseerr/Jellyseerr, pick seasons for TV, see what's trending, and a list of recent requests with their status.
- **Sign-in and admins** – people sign in with Plex, Jellyfin or a shared password. You choose who is an admin, and everyone else can be kept from seeing who is watching.

Every service is optional: configure what you have and the rest of the page simply doesn't render. All API keys stay inside the container; the browser only ever talks to Cuesheet, and posters are proxied through it.

![Cuesheet](docs/screenshot.png)

## Setup wizard

On first run the app opens a setup wizard: enter each service's URL and key, hit *Test connection* to confirm it (Jellyfin and Seerr also let you pick a user from a list), and save. Settings are written to `settings.json` in the data directory (`/config` in the container) and override any environment variables. Reopen it any time from *Settings* in the sidebar.

Turn on *Show demo data* (or set `DEMO_MODE=true`) to see the whole dashboard populated with sample data before connecting anything. *Your name* personalises the greeting and *Server name* is the small label above it.

## Who sees what

### Signing in

People can sign in with the accounts they already have:

- **Plex** — the plex.tv PIN flow, the same handshake Overseerr uses. Cuesheet never sees anyone's Plex password, and only accounts you have shared the server with can sign in. Needs outbound access to plex.tv from the container.
- **Jellyfin** — username and password go straight to your Jellyfin server, which decides whether they're valid.
- **Admin password** — a shared password set in Settings (or `ADMIN_PASSWORD`), useful before either provider is connected and as a way back in if Plex is unreachable.

Turn the providers on under *People* in Settings. Signing in is optional: anyone can still open the dashboard without it. What it changes is that the greeting uses their name, their own stream is labelled *You*, and admins see everything. Sessions are remembered per browser, so you sign in once on each device.

### Who is an admin

By default the Plex server owner and Jellyfin administrators are, which mirrors what those apps already grant them. You decide the rest: the *People* step lists everyone who has signed in, with a tick box to promote or demote each one, and *Trust the provider's admins* can be switched off so only the people you tick are admins. Ranks are resolved on every request, so a change takes effect immediately without anyone signing in again. *Sign everyone out* invalidates every session but your own.

### What viewers don't see

With *Hide who is watching from non-admins* on (the default), everyone who isn't an admin sees what is playing and its progress but not the user or device behind it. The redaction happens on the server, so the names aren't in the API either. Until any sign-in method exists, everyone is an admin, which is fine for a single household.

## Running on Unraid (Apollo)

### Option A – template (recommended)

1. Copy `unraid/cuesheet.xml` to `/boot/config/plugins/dockerMan/templates-user/` on Apollo (via the flash share or `scp`).
2. Docker tab → **Add Container** → pick **Cuesheet** from the *Template* dropdown.
3. Leave the *Config Folder* at `/mnt/user/appdata/cuesheet` and optionally set an *Admin Password*. The service URLs and keys are under *Show more settings* but you don't need them — the wizard covers it.
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

Use LAN addresses on Apollo (for example `http://192.168.1.10:32400`), or `http://<container-name>:<port>` if the containers share a custom Docker network.

All environment variables are listed in `.env.example`. They are optional once the wizard has been used; a value saved in the wizard wins over the matching variable.

The container starts as root only to make `/config` owned by `PUID:PGID` (defaults `99:100`, Unraid's `nobody:users`), then drops to that user.

## Security

Cuesheet is built for a home network. What it does on its own:

- **Credentials stay server-side.** Service keys live in `settings.json` (mode `0600`) and are never returned to the browser — the settings API reports only whether a key is set. Posters are proxied so the browser never holds a token, and the proxy only ever returns a bitmap, never active content.
- **The admin password is stored as a scrypt hash**, minimum 8 characters, with a short lockout after five wrong attempts from one address.
- **Sessions are HMAC-signed tokens** that carry identity only, never permissions, and expire after 60 days. Rank is resolved from your settings on every request, so promoting or demoting someone applies immediately. Changing the password, or *Sign everyone out*, rotates the signing secret and invalidates every other session.
- **Plex sign-in is bound to the browser that started it.** Each plex.tv PIN is tied to a random secret handed only to that browser and is single-use, so an outstanding sign-in can't be claimed by someone else.
- **A connection test will not send a stored key to a different host.** Retesting a saved service reuses its key only when the URL still points at that same server; otherwise you have to type the key in.
- **Response headers** set a content security policy, `nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`.

What it deliberately leaves to you:

- **Anyone who can reach the page can browse it and make Seerr requests.** That is the point of a household dashboard. If the page is reachable by people you don't want requesting media, put it behind a reverse proxy with its own authentication.
- **There is no HTTPS.** Serve it over a reverse proxy with TLS if it leaves your LAN, and set `TRUST_PROXY=1` so per-address sign-in limits see the real client.
- **Sessions are kept in browser storage**, so anyone with the device stays signed in until they sign out or the token expires.
- **Do not expose it to the internet directly.** Use a VPN or an authenticating proxy.

Run `npm audit` in both the root and `client/` after changing dependencies; both are expected to report zero vulnerabilities.

## Development

```sh
npm run install:all   # server + client deps
cp .env.example .env  # point at your services
npm run dev           # server on :3000, Vite client on :5173 (proxied to /api)
```

`npm run build` builds the client into `client/dist`; `npm start` serves it from the Express server.

## How it works

- `server/` – Express. One adapter per service under `server/services/`. `/api/streams`, `/api/recent` and `/api/calendar` fan out to every configured source and return `{ items, errors }`, so a single unreachable service shows a small warning instead of breaking the page. Responses are cached briefly (5 s for streams, minutes for the rest) and stale data is served if an upstream errors.
- `/api/image` – proxies posters from Plex, Jellyfin, Radarr and Sonarr so credentials are never sent to the browser. Seerr results use public TMDB poster URLs.
- `/api/settings` – read (secrets masked), update and test connections from the setup wizard; `server/config.js` merges env defaults with `settings.json`.
- `/api/auth/*` – sign-in. `server/services/plexAuth.js` runs the plex.tv PIN flow and checks the account reaches this server; `server/services/jellyfinAuth.js` forwards credentials to Jellyfin. A sign-in returns an HMAC-signed token that carries identity only, never permissions — rank is resolved from settings on every request, so promoting or demoting someone applies at once. The admin password is stored as a scrypt hash.
- `client/` – React + Vite + Tailwind. Polling pauses when the tab is hidden and resumes immediately when it becomes visible, which suits a wall-mounted display.

## Project

- [Changelog](CHANGELOG.md) — what changed in each release.
- [Security policy](SECURITY.md) — how to report a problem, and what Cuesheet
  does and does not protect against.
- [MIT licensed](LICENSE).
