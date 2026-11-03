# Angular i18n Tools

Navigate and refactor Angular's built-in localization IDs and runtime JSON
translations from VS Code. Works in VS Code desktop, the browser and Codespaces.

## Try it

[Open the Angular demo in Codespaces](https://codespaces.new/axeljaeger/angular-i18n-tools?quickstart=1&devcontainer_path=.devcontainer%2Fdemo-angular%2Fdevcontainer.json)
or [open the Nx demo](https://codespaces.new/axeljaeger/angular-i18n-tools?quickstart=1&devcontainer_path=.devcontainer%2Fdemo-nx%2Fdevcontainer.json).
Each demo builds and installs this extension and opens one sample project.
Allow the setup to finish; follow `DEMO.md` in the editor. A GitHub account and
Codespaces quota are required. GitHub shows machine and billing details before
a codespace is created.

## Install

The Marketplace identity is `angular-i18n-tools.angular-i18n-tools-vscode`.
Until the initial Marketplace publication is complete, install the VSIX from
the [extension release](https://github.com/axeljaeger/angular-i18n-tools/releases/tag/vscode-v0.0.1):
in VS Code, choose **Extensions → … → Install from VSIX…** and select the file.

Open a folder containing one Angular project and expand **Angular i18n** in
the Explorer. Catalogs are discovered automatically; no extension settings or
runtime library are required.

## What you can do

- Browse dot-separated message IDs as a tree. Select an ID to open its source.
- Use **Open Translation…** to jump to a locale's catalog entry.
- Use **Go to Definition** from a source ID to translations and back.
- Rename an ID with **F2**, or rename a group from the tree's context menu.
  Source templates, `$localize` messages and catalog keys change together.
- Move IDs and groups by dragging them in the tree.
- See missing and orphaned translations in the editor and Problems panel.
  Quick Fixes add missing keys or remove unused entries.
- Highlight Angular i18n metadata in HTML and TypeScript.

The demo contains `settingsDialog` and `userProfile` messages with English,
German and French catalogs. Remove a German key to see a missing-translation
diagnostic and Quick Fix; undo afterward. A new key's text is empty: the
extension does not translate messages automatically.

## Supported projects

Uses Angular `i18n`/`i18n-*` attributes and `$localize` with custom IDs, such as
`settingsDialog.applyButton`. Catalogs are `messages.<locale>.json` files with
Angular's `translations` map. The same file-based workflow works in an Angular
CLI app or an Nx application/library. XLIFF and third-party translation runtimes
are outside this extension's scope.

Currently, the opened folder is treated as one catalog. Open one independent
project at a time; a monorepo root with projects that reuse IDs or locales can
combine entries and report duplicates. The demo containers open the samples
separately for this reason. Automatic isolation of all Nx projects is not yet
implemented.

The extension reads workspace files and applies editor changes for your
requested refactors and Quick Fixes. It does not execute application code,
call translation services, upload catalogs or collect telemetry.

## Development

From the repository root:

```sh
pnpm --filter angular-i18n-tools-vscode run test
pnpm --filter angular-i18n-tools-vscode run test:web
pnpm --filter angular-i18n-tools-vscode run test:web:nx
pnpm --filter angular-i18n-tools-vscode run package:vsix
```

The browser bundle includes shared core analysis code; users do not need a
separate core package. See [publishing instructions](https://github.com/axeljaeger/angular-i18n-tools/blob/main/docs/vscode-extension-release.md)
for the Marketplace workflow and publisher setup.
