# Project site on GitHub Pages

The main entry point is `https://axeljaeger.github.io/angular-i18n-tools/`.
The static landing page in `site/`, both Angular apps, and both Storybooks are
assembled into a single GitHub Pages deployment. The landing page needs no
framework runtime, CDN scripts, or build step of its own.

## Landing page

Four product cards follow the workflow **Set up → Edit → Preview → Check**.
A native horizontal scroll-snap carousel centers each card; mobile shows one
card with neighboring edges. Four dot controls follow scrolling immediately.
Dot navigation takes 200 ms, or is instant when reduced motion is requested.
Shared subgrid rows align titles, descriptions, and primary actions. Each card
has a Docs link beside its phase label, a demo action, and an install action.

The generator and Storybook install buttons copy the versioned setup commands.
Hover or keyboard focus shows the real command with ellipsis inside the button;
copy feedback preserves its dimensions. Product illustrations animate on hover
only when reduced motion is not requested; these are placeholders for future
short videos, not recordings of the demos.

The VS Code card opens the Angular sample in Codespaces. Its Install popover
links to `vscode:extension/axeljaeger.angular-i18n-tools-vscode`, the published
[VS Code Marketplace listing](https://marketplace.visualstudio.com/items?itemName=axeljaeger.angular-i18n-tools-vscode),
and the existing VSIX release. Cursor and Open VSX options are disabled until
those destinations are available. The popup dismisses on Escape or outside click.
The official Microsoft Extensions icon and other local assets have
[attribution and licenses](../site/icons/README.md).

Catalog checks link to the [intentionally failing demo PR](https://github.com/axeljaeger/angular-i18n-tools/pull/33)
and the ready-to-copy workflow. Keep the demo PR open and do not merge it.
The page does not advertise an unpublished GitHub Marketplace listing.

Below the products, matching template and runtime JSON snippets illustrate a
stable custom ID. Links lead to Angular's annotation, custom-ID, and runtime
translation documentation. Translations load before bootstrap; switching the
language reloads the app.

## Demos

The generator demo opens the configured Angular application. The primary
Storybook demo uses an explicit preview loader; the addon does not discover
Angular CLI or Nx configuration. The second Storybook remains available at its
existing URL. Generator setup for Angular CLI and Nx, including existing app
and library Storybooks, is documented in the [setup guide](../packages/ng-generator/README.md).

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

The browser check follows local landing-page links, checks carousel navigation,
copy buttons, the install popup, reduced motion, icons, and the mobile layout,
loads both apps in three locales, and tests both staged Storybooks for locale
switching, URL-selected locales, and missing assets. Screenshots are written to
`dist/pages-check/` and each sample's ignored `storybook-demo/` directory.

Old root `?path=...` Storybook links redirect to `angular/storybook/`, preserving
the query and hash. Old `iframe.html?...` preview links also redirect.

In repository **Settings → Pages**, use **GitHub Actions** as the publishing
source. Any approval configured on the `github-pages` environment still applies.
See [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
