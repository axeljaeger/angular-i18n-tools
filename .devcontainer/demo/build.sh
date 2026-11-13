#!/usr/bin/env bash
set -euo pipefail
demo_repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$demo_repository"
corepack enable
corepack prepare pnpm@11.5.2 --activate
pnpm install --frozen-lockfile
