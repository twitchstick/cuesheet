# Changelog

All notable changes to Cuesheet are recorded here. Versions follow
[semantic versioning](https://semver.org): the major number changes when an
upgrade needs action from you, the minor when features are added, the patch
for fixes.

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

[1.0.0]: https://github.com/twitchstick/cuesheet/releases/tag/v1.0.0
