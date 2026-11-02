# Angular runtime localization setup

Configure Angular's built-in `loadTranslations()` workflow in an existing
standalone Angular app. Supports Angular CLI `angular.json` and Nx projects
with their own `project.json`. Nx support is available starting with **0.0.3**; automatic language discovery
is available starting with **0.0.4**.

## Angular CLI

Run from your Angular workspace root:

```sh
npx ng add @angular-i18n-tools/ng-generator@0.0.4
```

If more than one Angular application exists, add `--project=my-app`.

## Nx

Use an Nx Angular workspace with `@nx/angular` installed. Run from the workspace
root, replacing `my-app` with the application name from `nx show projects`:

```sh
npm install --save-dev @angular-i18n-tools/ng-generator@0.0.4 && npx nx generate @angular-i18n-tools/ng-generator:runtime-localize --project=my-app
```

The generator updates the selected app's `project.json`; it does not create an
`angular.json`. It supports explicit Angular application build targets using
`@nx/angular`, `@angular/build`, or `@angular-devkit/build-angular`, with
`options.browser` or `options.main` pointing to standalone `bootstrapApplication(...)`.
It selects the matching `extract-i18n` executor and leaves other apps untouched.
Applications with inferred-only targets, package.json-only project configuration,
custom executors, and NgModule bootstrap are outside this supported setup.

Verified with Nx 24 and Angular 22, including an actual `nx generate`, app build,
and JSON extraction. This is not a claim of compatibility with every Nx version.

## Automatic language discovery

You do not need to pass languages in the quick-start commands.

- The source language comes from the selected project's `i18n.sourceLocale`
  (a string or `{ "code": "..." }`). Angular's default `en-US` is used when absent.
- Target languages are the union of `i18n.locales` keys and
  `messages.<locale>.json` files under the selected app's source tree, excluding
  the source language. Other applications' catalogs are ignored.
- Explicit JSON paths in `i18n.locales` are respected, including catalogs with
  different filenames. Existing files are reused without changing translations.
- If no target languages are discoverable, only the source catalog and bootstrap
  setup are created. The generator explains this in its output; it does not
  invent German, French, or any other target languages. Add languages to the
  project configuration or add runtime JSON catalogs and rerun.

`--sourceLocale` and a nonempty `--locales` list remain optional overrides. Empty
lists use discovery. One runtime JSON catalog per language is supported;
ambiguous duplicates or multiple JSON files for one language are rejected.
Existing XLIFF files are not converted: only language keys can be discovered
from such configuration, and missing runtime JSON catalogs start empty.

## What changes

- Adds `@angular/localize` matching the workspace's `@angular/core` dependency
  when needed and schedules dependency installation.
- Adds `@angular/localize/init` to build polyfills, preserving existing entries.
- Adds an `extract-i18n` target writing Angular JSON catalogs to `src/locale`.
- Discovers source and target languages from project configuration and existing
  JSON catalogs, preserving translations and their paths. Creates only missing
  catalogs for those languages.
- Creates `src/locale-loader.ts` and loads translations before bootstrap.

`src` means the selected app's `sourceRoot`; nested Nx app paths are respected.
New catalogs start empty; discovered catalogs retain their content. Extract source messages and fill runtime
translations before expecting translated text:

```sh
# Angular CLI
npx ng extract-i18n --project=my-app
# Nx
npx nx run my-app:extract-i18n
```

Use stable custom message IDs such as `i18n="@@settingsDialog.title"`. Copy the
relevant IDs into the runtime catalogs' `translations` maps and translate their
values. Then serve the app and open `?locale=de` or `?locale=fr`. Locale changes
require a page reload; Angular loads translations before rendering.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `project` | The only Angular app | Required when multiple Angular apps exist |
| `sourceLocale` | Discovered; fallback `en-US` | Optional source language override |
| `locales` | Discovered | Optional target language override |
| `queryParam` | `locale` | URL parameter selecting the language |

For example: `--sourceLocale=en --locales=es,it --queryParam=lang`.
Rerunning preserves catalogs and avoids duplicate bootstrap wrapping or polyfills;
it regenerates `locale-loader.ts`, so review any manual edits there first.
