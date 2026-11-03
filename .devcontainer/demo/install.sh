#!/usr/bin/env bash
set -euo pipefail
demo_repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
demo_vsix="$demo_repository/packages/vscode-extension/dist/angular-i18n-tools.vsix"
if [[ ! -f "$demo_vsix" ]]; then
  echo "The extension has not been built. Run bash ../../.devcontainer/demo/build.sh and reconnect."
  exit 1
fi
code --install-extension "$demo_vsix" --force
echo "Angular i18n Tools is installed. Open DEMO.md and expand Angular i18n in the Explorer."
