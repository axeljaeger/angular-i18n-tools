# VS Code extension: demos and publishing

Maintainer follow-up: [manual publishing checklist](manual-publishing-todo.md).

Extension identity: `angular-i18n-tools.angular-i18n-tools-vscode`.
The VSIX includes the browser bundle and core analysis code. No npm packages
need to be installed in a user's Angular project.

## Demo

The landing page links to dedicated `.devcontainer/demo-angular` and
`.devcontainer/demo-nx` configurations. Each opens one project, builds a local
VSIX in postCreateCommand and installs it through VS Code's CLI in
postAttachCommand. This keeps the demos usable before Marketplace approval.
The `DEMO.md` file guides users through source/translation navigation, rename
and a missing-translation Quick Fix. No Codespace is created automatically by
the site; visitors choose their GitHub account, machine and quota themselves.

## Package and verify

```sh
pnpm install --frozen-lockfile
pnpm --filter angular-i18n-tools-vscode run package:vsix
mkdir -p dist/vscode-package-test
unzip -q packages/vscode-extension/dist/angular-i18n-tools.vsix -d dist/vscode-package-test
cd packages/vscode-extension
node scripts/run-web-tests.mjs --extension-path=../../dist/vscode-package-test/extension
node scripts/run-web-tests.mjs --project=sample-angular-nx --extension-path=../../dist/vscode-package-test/extension
```

The workflow `.github/workflows/vscode-extension.yml` repeats these checks on
changes and publishes the exact tested VSIX only when manually requested.
The package allowlist excludes tests, source files and development dependencies.

## Initial Marketplace setup

Sign in to [publisher management](https://marketplace.visualstudio.com/manage/publishers/).
Create or open publisher **angular-i18n-tools**. If this ID is unavailable, change
the manifest publisher and documentation/links consistently before publishing.

Under **Trusted Publishing**, create a policy with:

| Field | Value |
| --- | --- |
| Repository owner | `axeljaeger` |
| Repository | `angular-i18n-tools` |
| Workflow | `vscode-extension.yml` |
| Environment | Leave empty |

This grants only the configured GitHub workflow access to publish for this
publisher. No PAT needs to be placed in chat, local files or repository secrets.
See [Microsoft's publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace).

After the policy exists, run **VS Code extension → Run workflow → publish: true**,
or:

```sh
gh workflow run vscode-extension.yml --ref main -f publish=true
```

After publication is visible, update the landing page's VSIX installation link
to [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=angular-i18n-tools.angular-i18n-tools-vscode).
Keep the Codespaces and documentation links. Do not show an unpublished listing
as an available Marketplace installation.

## Open VSX / Cursor

The overview lists this as the **VS Code & Cursor extension**: both editors use
the same extension package. Open VSX publication is pending; the site links here
until an actual registry listing exists. The VSIX download remains available.

[Cursor uses Open VSX](https://cursor.com/help/customization/extensions) through
its own marketplace proxy and review process. Publishing on the Microsoft
Marketplace does not publish to Open VSX or guarantee visibility in Cursor.

To publish there, first create/link the Eclipse and Open VSX accounts, personally
accept the Publisher Agreement, and create namespace `angular-i18n-tools`.
Then upload the tested VSIX following the
[Open VSX publishing guide](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions).
This setup is separate from the Microsoft publisher and workflow above.

Once the extension is publicly available, replace the pending notice with its
Open VSX listing link, retaining the same extension ID on both registries.

## VSIX release

Publish the tested VSIX as a GitHub release with a `vscode-v<version>` tag.
The general npm release workflow excludes this tag family, so an extension
release cannot accidentally republish npm packages. Marketplace publishing
remains an explicit manual workflow action.
