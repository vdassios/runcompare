#!/usr/bin/env bash
# Runs a Playwright suite inside the official Playwright image, so macOS and Linux CI
# render the same pixels (PLAN §7).
#
#   scripts/playwright-docker.sh visual [playwright args…]   # tests/visual, 4 projects
#   scripts/playwright-docker.sh e2e    [playwright args…]   # tests/e2e
#
# The repo is mounted at /work. /work/node_modules is a named Docker volume with its own
# `npm ci`, because the host's macOS binaries (esbuild, rolldown) don't run on Linux.
# Inside a Playwright container already (CI sets RC_IN_CONTAINER=1), it runs Playwright
# directly.
set -euo pipefail

suite="${1:-}"
case "$suite" in
  visual) suite_args=(--project='desktop-*' --project='mobile-*') ;;
  e2e) suite_args=(--project=e2e --pass-with-no-tests) ;;
  *)
    echo "usage: $0 visual|e2e [playwright args…]" >&2
    exit 2
    ;;
esac
shift

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${RC_IN_CONTAINER:-}" == "1" ]]; then
  cd "$repo"
  # A bare --update-snapshots (or -u) would swallow a following spec path as its mode, which
  # breaks `npm run test:visual -- --update-snapshots tests/visual/<area>.spec.ts`.
  args=()
  for arg in "$@"; do
    case "$arg" in
      --update-snapshots | -u) args+=(--update-snapshots=changed) ;;
      *) args+=("$arg") ;;
    esac
  done
  exec npx playwright test "${suite_args[@]}" ${args[@]+"${args[@]}"}
fi

version="$(node -p "require('$repo/package.json').devDependencies['@playwright/test']")"
image="mcr.microsoft.com/playwright:v${version}-noble"
# CI runs on x86-64. Rendering the same architecture locally (emulated on Apple silicon)
# keeps font rasterisation identical to CI.
platform="${RC_PLAYWRIGHT_PLATFORM:-linux/amd64}"
# One node_modules volume per checkout and platform, so parallel worktrees don't share one.
key="$(printf '%s|%s' "$repo" "$platform" | shasum | cut -c1-12)"
modules_volume="runcompare-node-modules-${key}"
cache_volume="runcompare-npm-cache"

tty_args=()
if [[ -t 0 && -t 1 ]]; then tty_args=(-it); fi

# npm ci only when package-lock.json changed since the volume was last installed.
install='lock="$(sha1sum package-lock.json | cut -c1-40)"
if [ "$(cat node_modules/.rc-lock 2>/dev/null)" != "$lock" ]; then
  find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  npm ci --no-audit --no-fund
  echo "$lock" > node_modules/.rc-lock
fi'

exec docker run --rm "${tty_args[@]}" \
  --platform "$platform" \
  --ipc=host \
  --init \
  -v "$repo:/work" \
  -v "$modules_volume:/work/node_modules" \
  -v "$cache_volume:/root/.npm" \
  -w /work \
  -e CI \
  -e RC_IN_CONTAINER=1 \
  "$image" \
  bash -c "$install"' && exec scripts/playwright-docker.sh "$@"' playwright-docker "$suite" "$@"
