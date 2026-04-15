#!/bin/sh
set -e

# Claude OAuth credentials symlink (read-only mount)
if [ -f "/host-claude/.credentials.json" ]; then
  mkdir -p /home/nextjs/.claude
  ln -sf /host-claude/.credentials.json /home/nextjs/.claude/.credentials.json
  echo "[entrypoint] Claude OAuth credentials linked"
fi

exec "$@"
