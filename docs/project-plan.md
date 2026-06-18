# Angular Built-In Localization Tooling

## Vision

Provide tooling around Angular's built-in localization features with a focus on developer experience.

The project consists of:

1. A VS Code extension
2. A Storybook addon
3. An Angular CLI generator
4. Shared libraries for localization analysis
5. A sample Angular application for end-to-end testing

The tooling is initially focused on Angular applications that use built-in `i18n` and `$localize` messages with stable custom localization IDs. Runtime translation catalogs use Angular's JSON `translations` map with `loadTranslations()` and are loaded before bootstrap.

---

## Repository Structure

This project uses a monorepo.

```text
apps/
└── sample-angular/
packages/
├── core/
├── vscode-extension/
├── storybook-addon/
└── ng-generator/
```

---

## Development Setup

The workspace uses pnpm workspaces and TypeScript project references.

Key commands:

- `pnpm install`: install dependencies for all packages and apps
- `pnpm run build`: build tooling packages and the sample Angular app
- `pnpm run test`: run package tests
- `pnpm run typecheck`: run TypeScript checks across workspaces
- `pnpm run check:i18n`: fail when the sample workspace has duplicate, missing, or orphaned localization IDs
- `pnpm run dev:storybook`: start Storybook for `apps/sample-angular`
- `pnpm run dev:vscode-web`: start the VS Code web extension development host

The repository also exposes a reusable GitHub Action through `action.yml` so external Angular projects can run the same catalog completeness check in CI.

---

## Package: core

The core package contains all shared logic.

### Responsibilities

- Localization catalog model
- Localization ID parsing
- Tree generation from dot-separated IDs
- Duplicate detection
- Runtime JSON translation catalog loading
- Workspace indexing

### Example

Given:

```html
<button i18n="Button label@@settingsDialog.applyButton">
  Apply
</button>
```

The ID is:

```text
settingsDialog.applyButton
```

The generated tree is:

```text
settingsDialog
└── applyButton
```

### Public API

Proposed:

```ts
interface LocalizationEntry {
  id: string;
  sourceFile: string;
  line: number;
}

interface LocalizationCatalog {
  entries: LocalizationEntry[];
}

function buildTree(catalog: LocalizationCatalog): LocalizationTree;

function scanWorkspace(root: string): Promise<LocalizationCatalog>;
```

---

## App: sample-angular

The sample Angular application is used to validate the tooling against a real workspace.

### Responsibilities

- Provide representative Angular templates with stable localization IDs
- Include runtime JSON translation catalogs for at least two locales
- Demonstrate Angular built-in `i18n` and `$localize` usage
- Host Storybook stories that use the `storybook-addon`
- Provide a workspace target for VS Code extension features

### Example IDs

```text
settingsDialog.title
settingsDialog.applyButton
userProfile.email
```

The sample app should stay small, but it must cover the workflows needed to test scanning, tree generation, duplicate detection, navigation, Storybook locale selection, and rename behavior. Locale selection is a page-load concern, for example `?locale=de`, because translations must be loaded before Angular renders localized messages.

---

## Package: vscode-extension

VS Code extension providing localization tooling.

### Features

#### Localization Tree View

Displays localization IDs as a hierarchy.

Example:

```text
settingsDialog
├── title
├── description
├── applyButton
└── cancelButton
```

#### Rename Provider

Supports renaming localization IDs.

Example:

Rename:

```text
settingsDialog.applyButton
```

to:

```text
settingsDialog.confirmButton
```

Updates:

- Angular templates
- TypeScript files
- Runtime JSON translation catalogs

#### Syntax Highlighting

Provide syntax highlighting for Angular localization metadata.

Example:

```html
i18n="Dialog title@@settingsDialog.title"
```

Desired tokenization:

- description
- meaning
- custom id

---

## Package: storybook-addon

Storybook addon for Angular built-in localization workflows.

### Features

#### Locale Toolbar

Provides a locale selector for the Storybook preview.

Example:

```text
🌐 en
🌐 de
🌐 fr
```

#### Story Reloading

Changing locale should:

1. Persist the selected locale in Storybook globals
2. Reload or recreate the preview context
3. Ensure Angular translations are loaded before the story renders

### Example

```ts
export const globals = {
  locale: "en",
};
```

---

## Package: ng-generator

Angular CLI generator for adding the runtime localization workflow to an existing Angular application.

### Features

#### Runtime Localization Setup

Configures an Angular CLI application to load JSON runtime translation catalogs before bootstrap.

Generated changes:

- Adds `@angular/localize/init` to the application polyfills.
- Adds an `extract-i18n` target that writes JSON catalogs to `src/locale`.
- Creates `src/locale-loader.ts`.
- Creates initial `messages.<locale>.json` files.
- Wraps standalone `bootstrapApplication(...)` with `loadRuntimeTranslations()`.

Example:

```sh
ng generate @angular-i18n-tools/ng-generator:runtime-localize --locales de fr
```

The generator is intentionally scoped to Angular CLI application projects that use standalone bootstrap through `bootstrapApplication(...)`.

---

## Supported ID Convention

Localization IDs are expected to be dot-separated.

Examples:

```text
settingsDialog.title
settingsDialog.applyButton
settingsDialog.cancelButton

userProfile.name
userProfile.email
```

This convention is used exclusively for:

- Tree visualization
- Grouping
- Navigation

---

## Phase 1

Goal: Obtain a working localization index.

Deliverables:

- Sample Angular application with representative localized templates
- Workspace scanner
- Catalog model
- Tree generation
- Duplicate detection

Projects involved:

- sample-angular
- core

---

## Phase 2

Goal: Storybook locale selection for Angular built-in i18n runtime JSON catalogs.

Deliverables:

- Storybook addon
- Locale toolbar
- Sample stories that demonstrate locale selection through reload or rebootstrap semantics

Projects involved:

- sample-angular
- storybook-addon

---

## Phase 3

Goal: VS Code integration.

Deliverables:

- Tree view
- Syntax highlighting
- Navigation support
- Validation against the sample Angular workspace

Projects involved:

- sample-angular
- vscode-extension

---

## Phase 4

Goal: Safe localization ID refactoring.

Deliverables:

- Rename provider
- Reference search
- Runtime JSON translation catalog updates
- End-to-end rename validation in the sample app

Projects involved:

- sample-angular
- core
- vscode-extension

---

## Non-Goals

Initially out of scope:

- Angular compile-time localization
- Per-locale compiled frontend bundles
- Custom application translation runtime
- Live in-place language switching without reload or rebootstrap
- Translation management systems
- Machine translation
- IDE support other than VS Code
- XLIFF catalog workflows
