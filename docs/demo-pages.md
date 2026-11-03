# Project site on GitHub Pages

The main entry point is `https://axeljaeger.github.io/angular-i18n-tools/`.
The VS Code product offers an installable VSIX, a Codespaces demo and its own
documentation. The Marketplace installation replaces the VSIX action once the
publisher has completed the initial publication; an unpublished shop URL is
not presented as an available installation. Codespaces demos open the plain
Angular and Nx samples separately and install a local build of the extension.
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
