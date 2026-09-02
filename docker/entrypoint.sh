#!/bin/sh
# Make the data directory writable by PUID:PGID (Unraid defaults to 99:100),
# then drop privileges. If the container is started as a non-root user
# (e.g. `--user 1000:1000`), just run as that user.
set -e
DATA_DIR="${DATA_DIR:-/config}"
mkdir -p "$DATA_DIR" 2>/dev/null || true

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-99}"
  PGID="${PGID:-100}"
  chown -R "$PUID:$PGID" "$DATA_DIR" 2>/dev/null || echo "warning: could not chown $DATA_DIR"
  exec su-exec "$PUID:$PGID" "$@"
fi
exec "$@"
