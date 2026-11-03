# Angular i18n Tools

Tooling for Angular built-in localization workflows with stable custom IDs and runtime JSON catalogs.

## Live Demos

Visit the [project site](https://axeljaeger.github.io/angular-i18n-tools/) for an
introduction and links to both demo applications and their Storybooks:

- **Plain Angular application** at `/angular/`.
- **Angular application in NX workspace** at `/nx/`.

Each app demonstrates a settings dialog and user profile in English, German,
and French. Storybook lets you explore the components individually and switch
languages with the locale toolbar. The two demos use separate copies of the
same sample, with their workspace source clearly labeled in Storybook.

Run the Nx Storybook with `pnpm run dev:storybook:nx`, or the app with
`pnpm exec nx run sample-angular-nx:serve`. See [the Nx demo](apps/sample-angular-nx/README.md)
and [Pages build and deployment](docs/demo-pages.md) for details.

## Packages And Artifacts

This repository contains several related products:

- `@angular-i18n-tools/core`: catalog scanner, diagnostics, tree helpers, rename helpers, and CLI.
- `angular-i18n-tools-vscode`: VS Code extension for tree navigation, rename/refactor support, diagnostics, and quick fixes.
- `@angular-i18n-tools/storybook-addon`: Storybook locale toolbar integration for Angular built-in runtime translations.
- `@angular-i18n-tools/ng-generator`: Angular CLI generator for adding runtime JSON localization setup.
- `action.yml`: reusable GitHub Action for catalog completeness checks and PR annotations.

## Try In GitHub Codespaces

The repository includes a `.devcontainer/devcontainer.json` for GitHub Codespaces. When a Codespace is created, it installs the workspace dependencies and preinstalls the VS Code extensions used for demos, including CodeTour.

The guided VS Code tour lives in `.tours/vscode-extension-features.tour`. Codespaces opens the tour file on startup, and desktop VS Code users can run it after installing the recommended CodeTour extension.

Until the Angular i18n Tools VS Code extension is published to the Marketplace or packaged as a VSIX during setup, it is started as a local development extension:

```sh
npm run dev:vscode-web
```

Storybook can be started separately:

```sh
npm run dev:storybook
```

## Core CLI

Install the core package to run catalog checks from the command line:

```sh
npm install --save-dev @angular-i18n-tools/core
```

Run the checker against an Angular workspace or app directory:

```sh
npx angular-i18n-tools .
```

The CLI scans Angular templates, TypeScript `$localize` calls, and `messages.<locale>.json` runtime catalogs. It reports:

- duplicate source localization IDs
- missing translations
- orphaned translations

For GitHub Actions-compatible annotations:

```sh
npx angular-i18n-tools --github-annotations .
```

In this repository, the sample app is checked with:

```sh
npm run check:i18n
```

## VS Code Extension

The VS Code extension provides:

- localization ID tree view
- navigation from tree items to source IDs
- navigation from tree items to translation entries
- rename provider for localization IDs
- group rename from the tree context menu
- drag-and-drop refactoring in the tree
- missing/orphaned translation diagnostics and quick fixes
- semantic highlighting for Angular localization metadata

For local development:

```sh
npm run dev:vscode-web
```

The release workflow packages a VSIX artifact for GitHub releases. Marketplace publishing is planned once the extension metadata and publisher setup are finalized.

## Storybook Addon

Install the Storybook addon in an Angular Storybook project. The examples use `@storybook/angular-vite` with Vite 8 and the Analog Angular plugin:

```sh
npm install --save-dev @angular-i18n-tools/storybook-addon
```

Add it to `.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@storybook/angular-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.ts"],
  addons: ["@angular-i18n-tools/storybook-addon"],
  framework: {
    name: "@storybook/angular-vite",
    options: {}
  }
};

export default config;
```

Load runtime translations from `.storybook/preview.ts` before each story renders:

```ts
import "@angular/localize/init";
import type { Preview } from "@storybook/angular-vite";
import { loadTranslationsForLocale } from "../src/locale-loader";

const preview: Preview = {
  loaders: [
    async (context) => {
      const locale = context.globals.locale;

      if (typeof locale === "string") {
        await loadTranslationsForLocale(locale);
      }
    }
  ]
};

export default preview;
```

The Vite preview explicitly imports `@angular/localize/init` before loading translations; it does not inherit the app build polyfills.

The local sample app uses the workspace package:

```sh
npm run dev:storybook
```

The external dogfood demo in `examples/storybook-npm-demo` consumes `@angular-i18n-tools/storybook-addon@0.0.1` from npm. It is intentionally outside the pnpm workspace and will only install after the package is published:

```sh
cd examples/storybook-npm-demo
pnpm install
pnpm run storybook
```

Build and check the static preview under a GitHub Pages project path:

```sh
pnpm --filter @angular-i18n-tools/storybook-addon run build
pnpm --filter @angular-i18n-tools/sample-angular run build-storybook
pnpm --filter @angular-i18n-tools/sample-angular exec playwright install chromium
pnpm --filter @angular-i18n-tools/sample-angular run test:storybook-static
```

The browser check verifies both stories, locale switching, URL-selected locales, asset loading, and that Zone.js is absent. Screenshots are saved in `apps/sample-angular/storybook-demo/`. CI builds the static Storybook on every pull request.

The examples use `@storybook/angular-vite` for Storybook and `@angular/build` for the application build, development server, and translation extraction. The deprecated `@angular-devkit/build-angular` package is no longer a direct dependency. Analog still requires it transitively; unused direct animations, forms, and router dependencies have also been removed.

## Angular Generator

Set up Angular built-in runtime localization with one workspace-aware command:

```sh
npx @angular-i18n-tools/ng-generator@0.0.8
```

Angular CLI and Nx applications are discovered automatically. An interactive
checkbox list lets you select several apps or all at once. Languages come from
project configuration and existing JSON catalogs. For automation, use `--all`
or `--project=shop,admin`; use `--dry-run` to preview changes.

For existing Angular Storybooks, install and configure the language switcher with:

```sh
npx @angular-i18n-tools/ng-generator@0.0.8 storybook
```

This supports Angular application and library Storybooks, including
`getAbsolutePath(...)` framework names. It adds the addon, runtime loader
integration, and discovered toolbar languages while retaining existing settings. It expects Storybook to be initialized.

See the [setup guide](packages/ng-generator/README.md) for supported configurations,
options, dependency installation, and the extraction/translation workflow.

## GitHub Action

This repository provides a reusable GitHub Action that checks Angular built-in localization catalogs for:

- duplicate source localization IDs
- missing translations
- orphaned translations that no source ID uses anymore

Example workflow for another Angular project:

```yaml
name: i18n

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check-i18n:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: axeljaeger/angular-i18n-tools@v1
        with:
          path: .
```

Use `path` when the Angular workspace is in a subdirectory:

```yaml
- uses: axeljaeger/angular-i18n-tools@v1
  with:
    path: apps/web
```

The action scans `.html`, `.ts`, and `messages.<locale>.json` files. It exits with a non-zero status when catalog issues are found, making it suitable for pull request checks.

By default the action also emits GitHub workflow annotations for each issue, pointing at the source ID or orphaned translation key when a concrete location exists. Disable annotations when plain log output is preferred:

```yaml
- uses: axeljaeger/angular-i18n-tools@v1
  with:
    path: .
    annotations: "false"
```

## Zoneless Angular

Both Angular examples use Angular 22's default zoneless change detection. Their build polyfills load only `@angular/localize/init`, and neither example depends on `zone.js`.

Both Storybook targets (`storybook` and `build-storybook`) explicitly set `zoneless: true`, using the Storybook Angular Vite builder. Runtime localization and locale changes continue to load translations before rendering and reload the preview when needed.

The localization generator also supports zoneless applications without adding Zone.js. When used in an existing zone-based application, it preserves that application's polyfills.

## Storybook Dogfood Demo

`apps/sample-angular` is the development sample and uses `workspace:*` dependencies. `examples/storybook-npm-demo` is the publish-path sample and uses the npm package version directly:

```json
"@angular-i18n-tools/storybook-addon": "0.0.1"
```

The live project site uses the workspace addon, so it can deploy without an npm release. This external-consumer example only installs after its configured package version is published.

## Release Automation

The repository includes GitHub workflows for:

- CI checks on pushes and pull requests
- reusable GitHub Action smoke testing
- npm package packing and publishing
- VS Code extension VSIX packaging
- Storybook deployment to GitHub Pages

The GitHub Action should be consumed through a stable release tag, for example `axeljaeger/angular-i18n-tools@v1`. npm publishing requires an `NPM_TOKEN` repository secret. Storybook Pages deployment requires GitHub Pages to be enabled for GitHub Actions in the repository settings.
