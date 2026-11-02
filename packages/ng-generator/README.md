# Angular runtime localization setup

Configure Angular's built-in `loadTranslations()` workflow in an existing
standalone Angular app. Supports Angular CLI `angular.json` and Nx projects
with their own `project.json`. Nx support is available starting with **0.0.3**.

## Angular CLI

Run from your Angular workspace root:

```sh
npx ng add @angular-i18n-tools/ng-generator@0.0.3 --locales de fr
```

If more than one Angular application exists, add `--project=my-app`.

## Nx

Use an Nx Angular workspace with `@nx/angular` installed. Run from the workspace
root, replacing `my-app` with the application name from `nx show projects`:

```sh
npm install --save-dev @angular-i18n-tools/ng-generator@0.0.3 && npx nx generate @angular-i18n-tools/ng-generator:runtime-localize --project=my-app --locales=de,fr
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

## What changes

- Adds `@angular/localize` matching the workspace's `@angular/core` dependency
  when needed and schedules dependency installation.
- Adds `@angular/localize/init` to build polyfills, preserving existing entries.
- Adds an `extract-i18n` target writing Angular JSON catalogs to `src/locale`.
- Creates empty `messages.en-US.json`, `messages.de.json`, and `messages.fr.json`
  catalogs, preserving existing catalog files.
- Creates `src/locale-loader.ts` and loads translations before bootstrap.

`src` means the selected app's `sourceRoot`; nested Nx app paths are respected.
Generated catalogs start empty. Extract the source messages and fill the runtime
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
| `sourceLocale` | `en-US` | Source/default language |
| `locales` | `de`, `fr` | Runtime catalogs to create |
| `queryParam` | `locale` | URL parameter selecting the language |

For example: `--sourceLocale=en --locales=es,it --queryParam=lang`.
Rerunning preserves catalogs and avoids duplicate bootstrap wrapping or polyfills;
it regenerates `locale-loader.ts`, so review any manual edits there first.
