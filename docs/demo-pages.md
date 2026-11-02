# Project site on GitHub Pages

The main entry point is `https://axeljaeger.github.io/angular-i18n-tools/`.
It introduces the project, explains what visitors can try, links to the GitHub
repository, and offers both workspace demos:

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
