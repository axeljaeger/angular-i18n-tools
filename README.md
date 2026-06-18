# Angular i18n Tools

Tooling for Angular built-in localization workflows with stable custom IDs and runtime JSON catalogs.

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

Install the Storybook addon in an Angular Storybook project:

```sh
npm install --save-dev @angular-i18n-tools/storybook-addon
```

Add it to `.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@storybook/angular";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.ts"],
  addons: ["@angular-i18n-tools/storybook-addon"],
  framework: {
    name: "@storybook/angular",
    options: {}
  }
};

export default config;
```

Load runtime translations from `.storybook/preview.ts` before each story renders:

```ts
import type { Preview } from "@storybook/angular";
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

## Angular Generator

Add runtime JSON localization setup to an existing standalone Angular application:

```sh
npm install --save-dev @angular-i18n-tools/ng-generator
ng generate @angular-i18n-tools/ng-generator:runtime-localize --locales de fr
```

The generator:

- adds `@angular/localize/init` to build polyfills
- adds an `extract-i18n` target for JSON catalogs
- creates `src/locale-loader.ts`
- creates initial `messages.<locale>.json` catalogs
- wraps `bootstrapApplication(...)` so translations load before Angular bootstraps

It is currently scoped to Angular CLI application projects that bootstrap with `bootstrapApplication(...)`.

The package also exposes `ng-add`, so consumers can use:

```sh
ng add @angular-i18n-tools/ng-generator --locales de fr
```

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

## Storybook Dogfood Demo

`apps/sample-angular` is the development sample and uses `workspace:*` dependencies. `examples/storybook-npm-demo` is the publish-path sample and uses the npm package version directly:

```json
"@angular-i18n-tools/storybook-addon": "0.0.1"
```

That example is useful for the GitHub Pages showcase after the addon is published. Until then, it is expected not to install from a clean checkout.

## Release Automation

The repository includes GitHub workflows for:

- CI checks on pushes and pull requests
- reusable GitHub Action smoke testing
- npm package packing and publishing
- VS Code extension VSIX packaging
- Storybook deployment to GitHub Pages

The GitHub Action should be consumed through a stable release tag, for example `axeljaeger/angular-i18n-tools@v1`. npm publishing requires an `NPM_TOKEN` repository secret. Storybook Pages deployment requires GitHub Pages to be enabled for GitHub Actions in the repository settings.
