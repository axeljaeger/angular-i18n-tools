# Project site on GitHub Pages

The main entry point is `https://axeljaeger.github.io/angular-i18n-tools/`.
The VS Code & Cursor product offers an installable VSIX, a Codespaces demo and its own
documentation. The Marketplace installation replaces the VSIX action once the
publisher has completed the initial publication; an unpublished shop URL is
not presented as an available installation. Codespaces demos open the plain
Angular and Nx samples separately and install the published Marketplace extension.
Cursor/Open VSX is identified in the same product card, with a pending status
and a publishing-guide link until its registry listing is available.
All four products use the same boxed product-card styling and action order:
**demo** (the only primary button), **installer** (secondary link), then **Docs**.
The generator demo opens the configured Angular application; its npm page is the
installer. Storybook's installer links to its live addon-catalog entry. Both
copyable setup commands remain available under a collapsed **One-line setup**
disclosure. The editor demo opens Codespaces; its secondary installer downloads
the VSIX. Catalog checks link to the failing PR first and the ready-to-copy
workflow second. Marketplace availability is separate from these working actions.

The [Storybook catalog entry](https://storybook.js.org/addons/@angular-i18n-tools/storybook-addon)
is live. The Microsoft and GitHub Action listings currently return 404; do not
replace working installation links with those listings until they are published.

### Ecosystem installation UI

[Microsoft documents native extension links](https://code.visualstudio.com/docs/configure/command-line#_opening-vs-code-with-urls)
(`vscode:extension/publisher.name`), which open an extension's details in VS Code;
they do not install an unpublished VSIX. Its
[brand guidance](https://code.visualstudio.com/brand#action-buttons-and-links)
includes Open in VS Code buttons, rather than a reusable Marketplace installation
widget. [GitHub's native Action installation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/find-and-customize-actions)
is copying workflow YAML from the Marketplace listing. No embeddable install
widget is documented by either source.

The secondary VSIX and Action links use Microsoft's **Extensions** Codicon and
GitHub's **Workflow** Octicon. These are ecosystem UI symbols, not certification
badges. Files are hosted locally, with [sources and licenses](../site/icons/README.md).

### Catalog demo
 Catalog checks link to
[the intentionally failing demo PR](https://github.com/axeljaeger/angular-i18n-tools/pull/33),
their [documentation](catalog-checks.md), and a clearly marked Marketplace search
until the owner publishes the listing. The demo adds missing, orphaned and
duplicate IDs only in `examples/catalog-checks-demo`; keep it open and do not merge.
The landing page remains within one screen at the tested desktop/mobile sizes.
It introduces the project, explains what visitors can try, links to the GitHub
repository, and lists the products in workflow order: Angular setup generator
first, followed by the Storybook language switcher, VS Code extension, and catalog
checks. The generator uses one copyable workspace-aware npx command for both
Angular CLI and Nx, with a terminal checkbox list for multiple applications.
Storybook has its own one-line setup command for existing Angular application
and library Storybooks, including non-buildable Nx libraries. Generator 0.0.7+
also discovers libraries whose Nx settings live in package.json. Generator 0.0.8+
adds contextual setup errors and a `--verbose --dry-run` trace for troubleshooting.
Both product cards use the same documentation-link styling and link to the
full setup guide.
The Storybook product has one primary demo: the addon loads translations through
an explicit preview loader and does not discover Angular CLI or Nx project
configuration. The second Storybook remains available at its existing URL but
is not presented as a separate product demonstration. Angular CLI and Nx sample
projects remain available for editor and catalog tooling; their source and app
links are secondary. The setup generator supports explicit Nx `project.json` targets starting with
version 0.0.3; see [the setup guide](../packages/ng-generator/README.md).

Published routes:

| Path | Demo |
| --- | --- |
| `angular/` | Plain Angular CLI app |
| `angular/storybook/` | Plain Angular CLI Storybook |
| `nx/` | Same app in an Nx workspace |
| `nx/storybook/` | Nx Storybook |

Both apps contain a settings dialog and a user profile with English, German,
and French messages. For example, `nx/?locale=de` opens the German app and
`nx/storybook/?path=/story/sample-settings-dialog--default&globals=locale:de`
opens the German settings story. The Storybook sidebars and preview labels
identify which workspace the components come from. Language changes reload the
app or preview so Angular receives translations before rendering.

## Build and deploy

`.github/workflows/storybook-pages.yml` builds both production apps and both
Storybooks, stages them with the landing page in `dist/pages`, then uploads one
Pages artifact. Successful pushes to `main` and manual runs deploy it. Pull
requests build and browser-test the site without deploying. A shared deployment
concurrency group prevents deployments from overlapping.

Local verification:

```sh
pnpm install --frozen-lockfile
pnpm run build:pages
pnpm --filter @angular-i18n-tools/sample-angular exec playwright install chromium
pnpm run test:pages
```

The build sets each app's base href to its final repository and demo path.
`PAGES_BASE_PATH` defaults to `/angular-i18n-tools/`; override it in both commands
when testing another repository path. Storybook assets use relative URLs.
`scripts/pages/assemble.mjs` recreates the staging directory so removed assets
do not survive a rebuild. Landing-page source lives in `site/`.

The browser check follows local landing-page links, checks the mobile layout,
loads both apps in three locales, and tests both staged Storybooks for locale
switching, URL-selected locales, and missing assets. Screenshots are written to
`dist/pages-check/` and each sample's ignored `storybook-demo/` directory.

Old root `?path=...` Storybook links redirect to `angular/storybook/`, preserving
the query and hash. Old `iframe.html?...` preview links also redirect.

In repository **Settings → Pages**, use **GitHub Actions** as the publishing
source. Any approval configured on the `github-pages` environment still applies.
See [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
