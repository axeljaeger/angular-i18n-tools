# Repository Guidelines

## Project Structure & Module Organization

This repository is a pnpm-workspaces TypeScript monorepo for Angular built-in localization tooling. Documentation lives in `docs/`, with architectural decisions in `docs/addr/` and the roadmap in `docs/project-plan.md`.

Planned packages are:

- `packages/core/`: catalog model, ID parsing, runtime JSON catalog scanning, tree generation, and duplicate detection.
- `packages/vscode-extension/`: VS Code tree view, navigation, syntax highlighting, and rename support.
- `packages/storybook-addon/`: Storybook locale toolbar and preview reload integration.
- `apps/sample-angular/`: Angular sample app used to validate the tooling end to end.

Keep cross-package localization analysis in `core`; package-specific UI or framework integration belongs in the package that owns it. Runtime catalogs are `messages.<locale>.json` files with an Angular CLI `translations` map loaded through Angular's built-in `loadTranslations()` before bootstrap. Do not add application-level translation runtime logic or XLIFF/per-locale bundle workflow support unless the scope changes explicitly.

## Build, Test, and Development Commands

- `pnpm install`: install workspace dependencies.
- `pnpm run build`: compile packages and build the sample Angular app.
- `pnpm run test`: run workspace unit tests.
- `pnpm run typecheck`: run TypeScript checks for all workspaces.
- `pnpm run dev:storybook`: start Storybook for `apps/sample-angular`.
- `pnpm run dev:vscode-web`: launch the web VS Code extension development host.

## Coding Style & Naming Conventions

Use TypeScript for implementation packages. Prefer small, explicit public APIs and keep Angular, VS Code, and Storybook dependencies out of `packages/core/`.

Localization IDs should be dot-separated and stable, for example `settingsDialog.applyButton` or `userProfile.email`. Use camelCase for ID segments and TypeScript identifiers. Keep Markdown concise, with fenced code blocks for examples.

## Testing Guidelines

Add focused Vitest coverage with new implementation code, especially for catalog parsing, tree generation, duplicate detection, and rename/reference behavior. Place tests next to the code they cover using `*.test.ts`. Run `pnpm run test`, and use `pnpm --filter @angular-i18n-tools/vscode-extension run test:web` for VS Code web-extension behavior.

## Commit & Pull Request Guidelines

This repository has no commit history yet, so no local convention is established. Use short, imperative commit messages such as `Add core catalog model` or `Document monorepo architecture`.

Pull requests should include a clear description, the affected package or docs area, relevant issue links, and the commands run for verification. Include screenshots or recordings for VS Code and Storybook UI changes.

## Agent-Specific Instructions

Before editing, read the relevant docs in `docs/` and preserve the monorepo boundaries described there. Avoid adding unrelated scaffolding or dependencies unless the task explicitly requires it.
