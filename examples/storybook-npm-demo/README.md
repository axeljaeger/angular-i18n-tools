# Storybook npm Dogfood Demo

This example demonstrates the public install path for `@angular-i18n-tools/storybook-addon`.

Unlike `apps/sample-angular`, this project intentionally depends on the npm package:

```json
"@angular-i18n-tools/storybook-addon": "0.0.1"
```

It is not part of the pnpm workspace because it should behave like an external consumer. It will only install and build after `@angular-i18n-tools/storybook-addon@0.0.1` has been published to npm.

## Run

```sh
cd examples/storybook-npm-demo
pnpm install
pnpm run storybook
```

## Build

```sh
pnpm run build-storybook
```
