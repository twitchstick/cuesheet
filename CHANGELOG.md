# Changelog

All notable changes to Cuesheet are recorded here. Versions follow
[semantic versioning](https://semver.org): the major number changes when an
upgrade needs action from you, the minor when features are added, the patch
for fixes.

## [2.1.0] — 2026-09-03

### Changed

- **The front page leads with Now Playing.** The oversized hero and the side
  panel are gone; the stream cards now sit directly under the greeting, with a
  slim strip above them carrying the counts and the total bandwidth. Recently
  added, the calendar and requests follow underneath as before.

### Security

Findings from a pass over the code with a secure-coding checklist, all of them
consequences of removing sign-in in 2.0.0:

- **Link-local addresses are refused** when testing or saving a service URL.
  Private addresses stay allowed — that is where a media server lives — but
  `169.254.0.0/16` and the cloud metadata hostnames are not somewhere Cuesheet
  should ever reach, and the connection test is open to anyone on the network.
- **Redirects are followed by Cuesheet rather than by fetch**, and every hop is
  checked against the same rule, so a service cannot bounce a request onto a
  refused address. Redirect chains are capped.
- **Cross-site writes are rejected.** A request that changes settings and
  carries an Origin from another site is refused, which closes the drive-by and
  DNS-rebinding routes into an app that no longer asks who you are.
- **The image proxy caps how much it will pull down** from an upstream.

## [2.0.0] — 2026-09-02

### Removed

- **Sign-in, in full.** No Plex or Jellyfin accounts, no admin password, no
  admin list, and no hiding of who is watching. The dashboard is open to
  anyone who can reach it, and every stream shows its viewer again. The
  `ADMIN_PASSWORD` and `TRUST_PROXY` variables are gone with it.
- **Requesting from inside Cuesheet.** Search, trending and the season picker
  are gone. *Request media* opens Seerr in a new tab instead.

### Added

- **Bandwidth.** A total for the server, split between remote and local, plus a
  figure on every stream.
- **Server colours.** Plex streams carry Plex's gold, Jellyfin's carry its
  purple, on the hero, the stream cards and the active list.
- **Busy calendar days scroll** rather than stretching the whole week, with a
  button that walks through the day's releases.

### Changed

- The requests page is now a read-only view of what the house has asked for,
  with a link across to Seerr.

### Fixed

- Component styles sat outside Tailwind's layers, so utilities meant to
  override them were losing. The calendar's "today" border had been silently
  falling back to the default.

## [1.1.0] — 2026-09-02

### Changed

- **Services are configured inside Cuesheet only.** The Unraid template no
  longer carries service URLs and keys, leaving just the port, config folder,
  timezone, admin password and user ids. The environment variables still work
  for docker compose.
- **Recently added scrolls.** The row holds 15 posters by default and scrolls
  sideways, with arrows on wider screens. The count is a setting on the first
  step of the wizard, anywhere from 3 to 40.
- **The app's name is fixed.** The title field is gone from setup, along with
  the `APP_TITLE` variable.

### Removed

- **Demo mode**, with its setup checkbox, sample-data module, `DEMO_MODE`
  variable and the endpoint that generated placeholder artwork.

## [1.0.0] — 2026-09-02

First release.

### Dashboard

- **Now Playing** — active Plex and Jellyfin sessions with poster art, progress,
  direct play or transcode, resolution, and a featured stream with backdrop art.
- **Active streams panel** — counts per server and playback method, plus a list
  that surfaces slow transcodes and buffering sessions.
- **Recently Added** — a poster grid merged from both media servers, filterable
  by movies or series.
- **Coming this week** — a Monday-start calendar of Radarr releases (cinema,
  digital, physical) and Sonarr air dates, marking anything already downloaded.
- **Requests** — search, trending, per-season picking for TV, and a recent
  requests list, all through Overseerr or Jellyseerr.

### Setup and access

- **Setup wizard** — enter each service's URL and key, test the connection
  live, and pick a Jellyfin or Seerr user from a list. Settings are saved to
  `settings.json` in the config volume and override environment variables.
- **Sign in with Plex** using the plex.tv PIN flow, **with Jellyfin** using its
  own credentials, or with a shared admin password.
- **You choose the admins.** The Plex server owner and Jellyfin administrators
  qualify by default, and every person who signs in can be promoted or demoted
  from Settings. Ranks apply immediately, without anyone signing in again.
- **Viewer privacy** — non-admins see what is playing but not who is watching,
  except their own stream, which is marked as theirs.
- **Demo mode** fills the dashboard with sample data before anything is
  connected.

### Packaging

- Docker image at `ghcr.io/twitchstick/cuesheet`, built for `linux/amd64`.
- Unraid Community Applications template with a `/config` volume and
  `PUID`/`PGID` handling.

### Security

- Service keys stay server-side and are never returned to the browser; posters
  are proxied and the proxy only ever returns a bitmap.
- The admin password is stored as a scrypt hash, with a lockout after repeated
  failures.
- Sessions are HMAC-signed, expire after 60 days, and carry identity only —
  never permissions.
- Each Plex sign-in is bound to the browser that started it and is single-use.
- A connection test will not send a stored key to a different host.
- Responses carry a content security policy, `nosniff`, `X-Frame-Options` and
  `Referrer-Policy`.

[2.1.0]: https://github.com/twitchstick/cuesheet/releases/tag/v2.1.0
[2.0.0]: https://github.com/twitchstick/cuesheet/releases/tag/v2.0.0
[1.1.0]: https://github.com/twitchstick/cuesheet/releases/tag/v1.1.0
[1.0.0]: https://github.com/twitchstick/cuesheet/releases/tag/v1.0.0
