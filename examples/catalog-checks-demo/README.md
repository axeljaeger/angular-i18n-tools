# Catalog checks demo

A small, clean Angular localization fixture for the Catalog checks GitHub Action.
It uses the same built-in `i18n` and `$localize` syntax as the runnable Angular
and Nx samples, plus German and French runtime JSON catalogs. It does not need
an application build to validate the catalogs.

The public demo pull request deliberately removes a German translation, adds an
orphaned French key and duplicates a source ID. The Catalog checks job fails and
shows linked annotations plus a summary with repair guidance. The PR stays open
as a demonstration and must not be merged; this base fixture stays clean.

To reproduce locally after building core:

```sh
node packages/core/dist/cli.js examples/catalog-checks-demo
```

Scan independent Angular projects separately. This fixture demonstrates catalog
consistency, not translation quality or machine translation.
