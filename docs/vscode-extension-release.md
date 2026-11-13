# VS Code extension: demos and publishing

Extension identity: `axeljaeger.angular-i18n-tools-vscode`.
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
Its `registry` input selects `marketplace`, `open-vsx` or `both`; both publishing
jobs depend on verification and download the same immutable workflow artifact.
They run independently, so a Microsoft publisher failure cannot block an
authorized Open VSX release. `publish: false` runs verification only.
The package allowlist excludes tests, source files and development dependencies.

## Initial Marketplace setup

Sign in to [publisher management](https://marketplace.visualstudio.com/manage/publishers/).
Open publisher **axeljaeger**, matching the publisher in the extension manifest.

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
to [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=axeljaeger.angular-i18n-tools-vscode).
Keep the Codespaces and documentation links. Do not show an unpublished listing
as an available Marketplace installation.

## Open VSX / Cursor

The overview lists this as the **VS Code & Cursor extension**: both editors use
the same extension package. Open VSX publication is pending; the site links here
until an actual registry listing exists. The VSIX download remains available.

[Cursor uses Open VSX](https://cursor.com/help/customization/extensions) through
its own marketplace proxy and review process. Publishing on the Microsoft
Marketplace does not publish to Open VSX or guarantee visibility in Cursor.

Open VSX authentication is separate from the Microsoft publisher. The workflow
uses the fixed-version `ovsx` CLI and publishes the verified VSIX directly;
it does not repackage it with credentials present.

### Token mode and initial namespace

`openvsx_auth: token` requires the Actions secret `OVSX_PAT`. Only the validation,
namespace and publish steps receive this secret; dependency installation and
tests do not. Credentials are passed as environment variables rather than CLI
arguments. The account must have accepted the Open VSX Publisher Agreement and
be authorized to publish in the namespace.

`create_namespace: true` checks the namespace from the package manifest's
`publisher` (`axeljaeger`). A missing namespace is created; an existing one is preserved and
still requires publisher membership. Unexpected registry errors stop the job.
This option is restricted to token mode and is off by default.

```sh
gh workflow run vscode-extension.yml --ref main \
  -f publish=true -f registry=open-vsx \
  -f openvsx_auth=token -f create_namespace=true
```

Subsequent token-based releases can omit `create_namespace`.

### Trusted publishing

After the namespace is verified, an initial version is published and the Open
VSX trusted publisher policy is configured for this workflow, select
`openvsx_auth: trusted`. The job has `id-token: write` and invokes
`ovsx publish --trusted-publishing` without injecting `OVSX_PAT`; a stored PAT
cannot silently override this mode. No fallback to token mode is attempted.

```sh
gh workflow run vscode-extension.yml --ref main \
  -f publish=true -f registry=open-vsx -f openvsx_auth=trusted
```

Use `registry=both` when both publisher configurations are ready. Preparation
and verification do not create accounts, accept agreements, create namespaces
or publish extensions automatically. See the
[Open VSX publishing guide](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)
and [trusted publishing guide](https://github.com/eclipse-openvsx/openvsx/blob/main/cli/README.md#trusted-publishing).

Once the extension is publicly available, replace the pending notice with its
Open VSX listing link, retaining the same extension ID on both registries.

## VSIX release

Publish the tested VSIX as a GitHub release with a `vscode-v<version>` tag.
The general npm release workflow excludes this tag family, so an extension
release cannot accidentally republish npm packages. Marketplace publishing
remains an explicit manual workflow action.
