# ADR 0001: Monorepo Architecture

## Status

Accepted

## Context

The project consists of several tools:

- VS Code extension
- Storybook addon
- Shared localization analysis helpers
- Sample Angular application

All tools require access to a common localization model.

## Decision

Use a TypeScript monorepo with separate packages:

- core
- vscode-extension
- storybook-addon

The sample Angular application lives under `apps/` and is used for end-to-end validation. It is not a reusable package.

Shared functionality is implemented in core.

## Consequences

Advantages:

- Single source of truth
- Shared release process
- Easier refactoring

Disadvantages:

- Larger repository
- Shared CI pipeline
