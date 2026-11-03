# Angular localization setup

Set up Angular's built-in runtime JSON localization in an existing standalone
Angular CLI or Nx workspace. Starting with **0.0.5**, one command detects the
workspace and lets you choose multiple applications:

```sh
npx @angular-i18n-tools/ng-generator@0.0.8
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
npx @angular-i18n-tools/ng-generator@0.0.8 --all

# Select only these applications
npx @angular-i18n-tools/ng-generator@0.0.8 --project=shop,admin

# Preview changes without writing files or installing dependencies
npx @angular-i18n-tools/ng-generator@0.0.8 --all --dry-run
```

Noninteractive multi-app runs require `--all` or `--project`. `--skip-install`
updates package.json without running the package manager. A multi-app operation
is applied only when setup succeeds for every selected application.

## Storybook setup

For an **existing Angular Storybook**, run:

```sh
npx @angular-i18n-tools/ng-generator@0.0.8 storybook
```

Choose the Angular **applications and libraries** whose Storybooks you want to
configure. Both buildable and non-buildable libraries are offered when their
project configuration and Storybook configuration are discoverable. Known non-Angular
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
`main.ts`/`main.js`/`main.mts`/`main.mjs` configuration. Main config uses a
local default export; `export { config as default }` is also supported. Preview
annotations may use either a default object or local named exports such as
`export const parameters = ...`, `decorators`, `loaders`, `globalTypes` and
`initialGlobals`. Their style and unrelated settings are preserved. The framework can be a
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
Retry with the current pinned command above; the shown helper form needs no rewrite.

**0.0.7 adds discovery of `package.json#nx` projects.** Earlier versions only
discovered angular.json/project.json projects; package-based libraries could
still be absent from the chooser even with a valid framework configuration.

Starting with **0.0.8**, errors include the selected project, the failing setup
step, main/preview file, location when available, detected export/syntax form,
reason and concrete recovery instructions. Stable diagnostic codes distinguish
missing exports, unresolved imports/factories, syntax errors and unsupported
preview annotations. The original error is retained as the cause.

For a full local trace:

```sh
npx @angular-i18n-tools/ng-generator@0.0.8 storybook --verbose --dry-run
```

`--verbose` prints generator/Node versions, platform, workspace/package manager,
project discovery/selection and each setup step. Failures also print JavaScript
stacks, including the original causes. Output goes to the terminal; setup does
not upload a report or write a diagnostic file. Configuration contents and
source excerpts are omitted, including from parser errors; logs still contain
project names and file paths, so review these before sharing.

Configuration generation failures leave all selected projects unchanged. An
installation failure occurs after file changes have been committed; do not
interpret that as a rollback. `--dry-run` never applies generated files or runs
the install task.

In particular:

- `CONFIG_EXPORT_NOT_FOUND`: check the file named in the diagnostic. Main needs
  a local default export. Named preview annotations are supported; a failure in
  preview is not evidence that the main config is invalid.
- `CONFIG_EXPORT_UNRESOLVED`: the export exists, but imports/factories prevent
  safe static editing. Keep your existing config and integrate manually.
- `CONFIG_SYNTAX_ERROR`: fix syntax at the given file/line/column first.
- `PREVIEW_ANNOTATION_UNRESOLVED`: dynamic, mutable or re-exported annotations
  require an explicit local const array/object or manual integration.
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

Runtime application setup supports Angular CLI `angular.json`, Nx `project.json`,
and Nx settings in `package.json#nx`, with explicit Angular application build
targets using `@nx/angular`, `@angular/build`, or
`@angular-devkit/build-angular`. Build options must identify the standalone entry
with `browser` or `main`. JSON-with-comments configuration is accepted.

The Storybook command additionally supports libraries without application build
targets. Nx packages with an `nx` object are discovered, including `nx: {}`.
The project name is `nx.name`, then the package name (including its scope), then
the directory name. When both package.json and project.json exist, their settings
are combined, with project.json overrides. Setup saves runtime changes in the
existing config and preserves package metadata; it does not create project.json.

For example, a library with `libs/ui/.storybook/main.ts` needs only:

```json
{
  "name": "@example/ui",
  "nx": {}
}
```

Its sources default to `libs/ui/src`. Set `nx.sourceRoot` for another location.
For a nonstandard Storybook directory, specify `nx.targets.<target>.options.configDir`
using a workspace-relative path. Storybook framework detection still reads the
existing main config. Arbitrary Nx plugin inference and packages with neither an
`nx` object nor a project.json entry are not discovered by this standalone CLI.
Custom runtime application executors and NgModule bootstrap are outside runtime setup. Verified with Nx 24 and Angular 22, including
real terminal selection, application builds, and a generated Storybook tested
in Chromium. This is not a claim of compatibility with every Nx version.

The existing schematics remain available for already-installed consumers:

```sh
npx ng add @angular-i18n-tools/ng-generator@0.0.8
npx nx generate @angular-i18n-tools/ng-generator:runtime-localize --all
npx nx generate @angular-i18n-tools/ng-generator:storybook-localize --project=my-app
```
