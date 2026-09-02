# Security

Cuesheet holds the API keys to your media stack, so it is worth treating its
security seriously even on a home network.

## Reporting a problem

Open a [private security advisory](https://github.com/twitchstick/cuesheet/security/advisories/new)
rather than a public issue. Please include what you did, what happened, and
what you expected. There is no bounty; this is a personal project.

## Supported versions

The latest release is the supported one. Fixes land on `main` and go out in the
next release.

## How Cuesheet protects itself

- Service keys live in `settings.json` (mode `0600`) inside the config volume
  and are never returned to the browser — the settings API reports only whether
  a key is set.
- Poster art from your media servers is proxied so the browser never holds a
  credential, and the proxy refuses to return anything that is not a bitmap.
  Artwork for request results loads from TMDB in the browser, the same as
  Overseerr does it.
- The admin password is stored as a scrypt hash. Repeated failures from one
  address pause sign-in.
- Sessions are HMAC-signed tokens carrying identity only, never permissions,
  and expire after 60 days. Changing the password or using *Sign everyone out*
  rotates the signing secret and invalidates every other session.
- Each plex.tv sign-in PIN is tied to a secret held only by the browser that
  started it, and is single-use.
- A connection test reuses a saved key only when the URL still points at the
  server that key belongs to.

## What is left to the operator

- Anyone who can reach the page can browse it and make Seerr requests. That is
  intentional for a household dashboard. Put it behind an authenticating proxy
  if that is not what you want.
- There is no HTTPS. Terminate TLS at a reverse proxy and set `TRUST_PROXY=1`
  so per-address sign-in limits see the real client.
- Do not expose Cuesheet directly to the internet. Use a VPN or an
  authenticating proxy.
