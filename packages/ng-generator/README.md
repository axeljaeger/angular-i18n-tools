# Angular localization setup

Set up Angular's built-in runtime JSON localization in an existing standalone
Angular CLI or Nx workspace. Starting with **0.0.5**, one command detects the
workspace and lets you choose multiple applications:

```sh
npx @angular-i18n-tools/ng-generator@0.0.6
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
npx @angular-i18n-tools/ng-generator@0.0.6 --all

# Select only these applications
npx @angular-i18n-tools/ng-generator@0.0.6 --project=shop,admin

# Preview changes without writing files or installing dependencies
npx @angular-i18n-tools/ng-generator@0.0.6 --all --dry-run
```

Noninteractive multi-app runs require `--all` or `--project`. `--skip-install`
updates package.json without running the package manager. A multi-app operation
is applied only when setup succeeds for every selected application.

## Storybook setup

For an **existing Angular Storybook**, run:

```sh
npx @angular-i18n-tools/ng-generator@0.0.6 storybook
```

Choose the Angular **applications and libraries** whose Storybooks you want to
configure. Both buildable and non-buildable libraries are offered when their
project.json and Storybook configuration are discoverable. Known non-Angular
Storybooks are excluded. `--all`, `--project`,
`--dry-run`, and `--skip-install` work here too.

The command:

- Installs `@angular-i18n-tools/storybook-addon` if it is not already a dependency.
- Adds the addon to the existing `addons` array.
- Creates runtime localization setup when no locale-loader exists. An existing
  compatible loader is preserved, including manual additions.
- Creates `.storybook/angular-i18n-tools.ts` to load translations and define the
  toolbar languages discovered from the selected project.
- Extends the preview's loaders and locale globals while preserving other
  addons, loaders, decorators, parameters, and globals.

For libraries, setup prepares catalogs and a locale-loader for Storybook only.
A new loader is placed in `.storybook/locale-loader.ts`, outside production
library sources; an existing compatible source loader is reused.
It does not require `main.ts` or `bootstrapApplication`, and does not change the
library's public entry point, ng-packagr build, polyfills, or extraction targets.
Extract library messages through your existing host-app/extraction workflow;
setup does not invent an application build target for a library.
Libraries can keep their own JSON catalogs or reference shared catalogs through
`i18n.locales`. Without configured languages/catalogs, only the source language
is offered; languages are not guessed from other applications.

Supports `@storybook/angular` and `@storybook/angular-vite` with ES module
`main.ts`/`main.js`/`main.mts`/`main.mjs` configuration. The framework can be a
string, object, local const alias, or a standard package-resolution expression:

```ts
const config = {
  framework: {
    name: getAbsolutePath('@storybook/angular-vite'),
    options: {}
  },
  addons: []
};
export default config;
```

`require.resolve(...)`, `import.meta.resolve(...)`, resolved package paths,
`dirname(require.resolve(join(...)))`, local const spreads, type assertions and
`satisfies` are also recognized. Setup analyzes the syntax; it does not execute
your configuration or helper functions. Keep the framework your project already
uses. Do not switch between Angular and Angular-Vite merely to satisfy setup.

## Troubleshooting Storybook detection

**0.0.5 had two detection limitations fixed in 0.0.6:** it excluded libraries,
and only accepted literal framework package names. A valid
`getAbsolutePath('@storybook/angular-vite')` configuration could therefore fail.
Retry with the pinned 0.0.6 command above; the shown helper form needs no rewrite.

New errors identify the project, file, line/column, actual framework expression,
why it was rejected, supported values, and recovery examples. In particular:

- Missing `framework`: check the exported config or its inherited base.
- Imported/dynamic framework: provide a matching explicit override, or use
  [manual integration](../../README.md#storybook-addon). Arbitrary functions and
  imported configurations are not evaluated.
- Non-Angular framework: use this setup only for your actual Angular Storybook.
- Dynamic or inherited `addons`, `loaders`, or globals: make the relevant property
  explicit while preserving your base settings, or integrate manually. Setup
  refuses to silently replace inherited settings.

Selected projects are configured together. Detection/generation failures do not
write partial files. Each selected project needs its own Storybook config.

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

Runtime application setup supports Angular CLI `angular.json` and Nx `project.json`
with explicit Angular application build targets using `@nx/angular`, `@angular/build`, or
`@angular-devkit/build-angular`. Build options must identify the standalone entry
with `browser` or `main`. JSON-with-comments configuration is accepted.

The Storybook command additionally supports libraries without application build
targets. Project discovery still requires angular.json entries or project.json;
package.json-only/inferred project discovery is not implemented. Custom runtime
application executors and NgModule bootstrap are outside runtime setup. Verified with Nx 24 and Angular 22, including
real terminal selection, application builds, and a generated Storybook tested
in Chromium. This is not a claim of compatibility with every Nx version.

The existing schematics remain available for already-installed consumers:

```sh
npx ng add @angular-i18n-tools/ng-generator@0.0.6
npx nx generate @angular-i18n-tools/ng-generator:runtime-localize --all
npx nx generate @angular-i18n-tools/ng-generator:storybook-localize --project=my-app
```
