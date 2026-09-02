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

## No sign-in

Cuesheet has no accounts. Anyone who can open the page sees the dashboard and
can change its settings, which is why it belongs on a home network rather than
the open internet. Put it behind a VPN or an authenticating reverse proxy if it
needs to be reachable from outside.

## How Cuesheet protects itself

- Service keys live in `settings.json` (mode `0600`) inside the config volume
  and are never returned to the browser — the settings API reports only whether
  a key is set.
- Poster art from your media servers is proxied so the browser never holds a
  credential, and the proxy refuses to return anything that is not a bitmap.
  Artwork for request results loads from TMDB in the browser, the same as
  Overseerr does it.
- A connection test reuses a saved key only when the URL still points at the
  server that key belongs to.
- Responses carry a content security policy, `nosniff`, `X-Frame-Options` and
  `Referrer-Policy`.

## What is left to the operator

- **Do not expose Cuesheet directly to the internet.** Use a VPN or an
  authenticating proxy.
- There is no HTTPS. Terminate TLS at a reverse proxy if it leaves your LAN.
- Anyone on your network can make requests through the Seerr link and change
  Cuesheet's service settings.
