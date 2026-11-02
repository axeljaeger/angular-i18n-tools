# Angular localization setup

Set up Angular's built-in runtime JSON localization in an existing standalone
Angular CLI or Nx workspace. Starting with **0.0.5**, one command detects the
workspace and lets you choose multiple applications:

```sh
npx @angular-i18n-tools/ng-generator@0.0.5
```

Run from the workspace root. In an interactive Nx terminal, all supported
Angular applications appear in a checkbox list. Use **Space** to select or
clear an app, **A** to toggle all, and **Enter** to apply. All are initially
checked. Cancelling leaves files unchanged. A single Angular CLI app is selected
automatically; multiple Angular CLI apps get the same chooser.

The command does not require a local installation of this generator. It adds
needed runtime dependencies to your workspace and uses its package manager.
Use a current Node 22, 24, or 26 release (see the package's engines field).

## Automation and preview

```sh
# Configure all supported applications without a prompt
npx @angular-i18n-tools/ng-generator@0.0.5 --all

# Select only these applications
npx @angular-i18n-tools/ng-generator@0.0.5 --project=shop,admin

# Preview changes without writing files or installing dependencies
npx @angular-i18n-tools/ng-generator@0.0.5 --all --dry-run
```

Noninteractive multi-app runs require `--all` or `--project`. `--skip-install`
updates package.json without running the package manager. A multi-app operation
is applied only when setup succeeds for every selected application.

## Storybook setup

For an **existing Angular Storybook**, run:

```sh
npx @angular-i18n-tools/ng-generator@0.0.5 storybook
```

Choose the applications whose Storybooks you want to configure. Only applications
with a discoverable Storybook configuration are offered. `--all`, `--project`,
`--dry-run`, and `--skip-install` work here too.

The command:

- Installs `@angular-i18n-tools/storybook-addon` if it is not already a dependency.
- Adds the addon to the existing `addons` array.
- Creates runtime localization setup when no locale-loader exists. An existing
  compatible loader is preserved, including manual additions.
- Creates `.storybook/angular-i18n-tools.ts` to load translations and define the
  toolbar languages discovered from the application.
- Extends the preview's loaders and locale globals while preserving other
  addons, loaders, decorators, parameters, and globals.

Supports `@storybook/angular` and `@storybook/angular-vite` with ES module
`main.ts`/`main.js`/`main.mts`/`main.mjs` configuration. Existing exported config
objects (including `defineConfig({...})`) are edited without replacing the file.
Dynamic config factories or dynamic `addons`/`loaders` expressions require
[manual integration](../../README.md#storybook-addon); setup refuses them rather
than overwriting code. Each selected app needs its own Storybook config.

This adds localization to an existing Storybook; it does not install the
Storybook framework itself. If Storybook is not initialized, initialize it first
and rerun the command. Rerunning setup updates its generated helper to reflect
newly configured languages without adding duplicate entries. It does not
regenerate a compatible existing locale-loader; rerun runtime setup first when
new languages need to be added to that loader too.

## What runtime setup changes

- Adds `@angular/localize` matching the app's/workspace's `@angular/core` dependency
  when needed and schedules installation once for the selected applications.
- Adds `@angular/localize/init` to build polyfills, preserving existing entries.
- Adds an `extract-i18n` target writing Angular JSON catalogs to `src/locale`.
- Discovers languages and existing JSON catalogs, preserving translations and
  their paths. Creates only missing catalogs for those languages.
- Creates `src/locale-loader.ts` and loads translations before standalone bootstrap.

`src` means the selected app's sourceRoot. New catalogs start empty. Extract
source messages and fill target translations before expecting translated text:

```sh
# Angular CLI
npx ng extract-i18n --project=my-app
# Nx
npx nx run my-app:extract-i18n
```

Use stable custom IDs such as `i18n="@@settingsDialog.title"`. Translate the
corresponding values in the catalogs' `translations` maps. Open `?locale=de` when
German is a configured target. Locale changes reload the app or Storybook preview.

## Automatic language discovery

No language arguments are needed in the quick-start commands.

- The source language comes from project `i18n.sourceLocale` (a string or
  `{ "code": "..." }`); Angular's default `en-US` is used when absent.
- Target languages combine `i18n.locales` keys and `messages.<locale>.json` files
  under the selected app's sources, excluding the source language. Other apps'
  catalogs are ignored. Explicit configured JSON paths are respected too.
- Existing translation contents are preserved. With no target configuration or
  catalogs, only the source language is set up; German/French are not invented.
  Add languages to project configuration or add JSON catalogs and rerun.

Optional CLI overrides are `--source-locale=en`, `--locales=es,it`, and
`--query-param=lang`. One runtime JSON catalog per language is supported;
ambiguous duplicates or multiple configured JSON files are rejected. XLIFF files
are not converted: their configured language keys can be discovered, but missing
runtime JSON catalogs still start empty.

Rerunning **runtime setup** regenerates `locale-loader.ts`, so review manual
changes there first. Catalogs and unrelated configuration are preserved.

## Supported workspace configuration

Supports Angular CLI `angular.json` and Nx `project.json` with explicit Angular
application build targets using `@nx/angular`, `@angular/build`, or
`@angular-devkit/build-angular`. Build options must identify the standalone entry
with `browser` or `main`. JSON-with-comments configuration is accepted.

Inferred-only targets, package.json-only projects, custom executors, and NgModule
bootstrap are outside this setup. Verified with Nx 24 and Angular 22, including
real terminal selection, application builds, and a generated Storybook tested
in Chromium. This is not a claim of compatibility with every Nx version.

The existing schematics remain available for already-installed consumers:

```sh
npx ng add @angular-i18n-tools/ng-generator@0.0.5
npx nx generate @angular-i18n-tools/ng-generator:runtime-localize --all
npx nx generate @angular-i18n-tools/ng-generator:storybook-localize --project=my-app
```
