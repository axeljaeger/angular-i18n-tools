# Nx Angular demo

This copies the app from `../sample-angular` into a conventional Nx project.
The repository root is the Nx workspace (`nx.json`), and this project's targets
live in `project.json` rather than `angular.json`. Components, styles, stories,
and runtime translation catalogs live locally under `src/` and `.storybook/`.
The Storybook sidebar and preview identify these stories as **Angular application in NX workspace**;
the plain demo uses **Plain angular application**. Story IDs remain stable for existing links.
Both demos start with the same content; update both copies when changing the
showcase so they continue to demonstrate equivalent behavior.

The landing page uses one Storybook demo because the addon does not read workspace
configuration: both demos explicitly configure their translation loaders. This Nx
project remains a sample for workspace-dependent tooling. The Angular setup
generator currently requires `angular.json` and does not support Nx `project.json`.

Nx 24 supports the sample's Angular 22.2 version. The demo uses Angular and
Storybook builders as Nx executors, with local caching and an addon build
dependency. Nx-specific configuration stays here; localization analysis stays
in `packages/core`.

Run these commands from the repository root after `pnpm install`:

```sh
# App: http://localhost:4200/?locale=de (also en-US and fr)
pnpm exec nx run sample-angular-nx:serve

# Storybook: http://localhost:6007/
pnpm run dev:storybook:nx

# Static builds
pnpm run build:demo:nx
pnpm exec nx run sample-angular-nx:build-storybook
```

Application output: `dist/sample-angular-nx/browser/`.
Storybook output: `dist/storybook/sample-angular-nx/`.
The Nx polyfills entry resolves Angular localization from this
project's dependencies when builders run from the repository root. Both demos
still load runtime catalogs before bootstrap using Angular's `loadTranslations()`.

Check the static Storybook in Chromium under its Pages subdirectory:

```sh
pnpm --filter @angular-i18n-tools/sample-angular-nx exec playwright install chromium
pnpm --filter @angular-i18n-tools/sample-angular-nx run test:storybook-static
```

The check covers both stories, locale switching, URL-selected locales, and
missing assets. Screenshots are written to `storybook-demo/`.

Use `pnpm exec nx show project sample-angular-nx` to inspect all targets.
See [GitHub Pages deployment](../../docs/demo-pages.md) for hosting both demos.
