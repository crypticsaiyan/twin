#!/usr/bin/env sh
# Copies this repository into a solari-cookbook checkout as applications/twin.
# The standalone repo is the source of truth; the cookbook copy is a snapshot of it.
# Usage: scripts/sync-fork.sh /path/to/solari-cookbook
set -eu

cookbook=${1:?usage: scripts/sync-fork.sh /path/to/solari-cookbook}
[ -f "$cookbook/applications/README.md" ] || { echo "not a solari-cookbook checkout: $cookbook" >&2; exit 1; }

root=$(cd "$(dirname "$0")/.." && pwd)
target="$cookbook/applications/twin"
# The target belongs entirely to twin, so replacing it keeps deletions in sync.
rm -rf "$target"
mkdir -p "$target"

# Only tracked files are copied, so local artifacts (node_modules, dist, .env, capsules) never leak.
# CI config is the standalone repo's own; the cookbook has its own checks. LICENSE is left out
# because contributions to the cookbook fall under its Apache-2.0 license.
cd "$root"
git ls-files -z | grep -zvE '^(\.github/|LICENSE$)' | rsync -a --from0 --files-from=- ./ "$target/"
echo "synced $(git rev-parse --short HEAD) into $target"
