# Changelog

All notable changes to Cuesheet are recorded here. Versions follow
[semantic versioning](https://semver.org): the major number changes when an
upgrade needs action from you, the minor when features are added, the patch
for fixes.

## [2.5.1] — 2026-09-03

### Fixed

- **Adding a quick link did nothing on a real deployment.** `crypto.randomUUID()`,
  used to generate a new link's id, only exists in a secure context — HTTPS,
  or the special case of `127.0.0.1`. Cuesheet is plain HTTP on a LAN address,
  which is neither, so the browser silently failed to build a new link and the
  dialog never closed. It was invisible in testing because testing happened
  against `127.0.0.1`, which is exempt from the very restriction that broke
  it everywhere else. The id is now assigned by the server, which was never
  under this restriction to begin with.
- **A link's favicon never loaded**, for the same underlying gap: the content
  security policy only allowed images over `https:`, and a LAN service is
  almost always `http:`. Saving a link now adds its own origin to the policy,
  rather than opening `http:` up wholesale.

## [2.5.0] — 2026-09-03

### Added

- **Quick links.** A row of squares at the top of the front page for
  anything else on your network — Unraid's own UI, Portainer, Tracearr,
  whatever else you'd otherwise keep a separate bookmark for. Add one with
  a name and an address; the icon defaults to the site's own favicon,
  loaded by your browser directly rather than by Cuesheet, with a small
  curated set of icons to fall back on when a site doesn't serve one or the
  favicon just doesn't look right at that size. Hover a tile to edit or
  remove it. Each one opens in a new tab, the same way the Request media
  button already does.

## [2.4.0] — 2026-09-03

### Added

- **A download queue.** A new Downloads tab, and a compact block on the front
  page, show what Radarr and Sonarr are currently fetching: title, progress,
  size, time left and status — downloading, importing, queued, paused,
  stalled or failed. Nothing that needs a look gets buried: failed and
  stalled items sort to the top, everything else by soonest-to-finish. It
  works with whatever download client Radarr or Sonarr are already using —
  no new credentials, since the queue is read from the *arr apps you have
  configured, not from the download client directly. Click a row for the
  same detail panel a poster opens. Read-only, like everything else here.

## [2.3.0] — 2026-09-03

### Added

- **Click a poster or a stream for the detail behind it.** Posters in Recently
  added and releases in either calendar open a panel with the synopsis, runtime,
  genres, certificate, rating, cast and crew, and what the file actually is.
  It reads from whichever service the item came from — Plex, Jellyfin, Radarr
  or Sonarr.
- **Stream details show the signal path.** Clicking a session opens its
  technical side: video and audio codecs with what they are being turned into,
  resolution, profile, frame rate, channels, container and subtitles, plus the
  session's player, device, bandwidth and connection. Jellyfin reports why it
  is transcoding and those reasons are shown; Plex does not report one, so the
  video and audio rows show what it changed instead of inventing a reason. The
  timecodes keep running while the panel is open, and it closes itself if the
  stream stops. The stats come from the session data already on screen, so
  opening one costs no extra call to your server.

### Fixed

- **Stream cards no longer overhang a phone screen.** As grid items they could
  grow past the viewport instead of letting their text truncate, which pushed
  the whole page sideways by about 35px.

## [2.2.0] — 2026-09-03

### Added

- **The release calendar tab shows a whole month.** A Monday-start grid with
  arrows either side of the month name, and the name itself is a button that
  jumps back to today. Days with more than a few releases scroll inside their
  own cell and label the total, so a busy Friday no longer stretches the row.
  Days with nothing scheduled are drawn bare rather than as empty cards, which
  keeps a quiet month quiet. The overview still shows the week ahead.

### Changed

- **Now Playing moved off the sidebar.** It leads the overview, so the separate
  tab was showing the same panel twice. An old `#streams` link lands on the
  overview.
- **Typography is self-hosted.** Archivo for the interface and JetBrains Mono
  for anything that reads as an instrument — timecodes, bitrates, dates — ship
  with the container, so the dashboard looks the same on every machine and
  needs no outside font request.
- **Streams read as a playout log.** Each row carries a tally light (on air,
  slow, buffering), elapsed and remaining timecodes, and a cue strip with a
  playhead in place of the old gradient pill. Codec, bitrate and playback
  method sit on their own line so nothing truncates.
- **Quieter chrome throughout** — less glow, fewer competing accents, and
  numbers set in tabular figures so they stop shifting as they tick.

### Fixed

- **The calendar accepts a six-week range.** The API capped a request at 31
  days, one week short of the widest month grid, so the neighbouring days at
  either end of a month never carried their releases.

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
