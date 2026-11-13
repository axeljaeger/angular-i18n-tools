# Angular i18n Tools Check

Check Angular built-in localization runtime JSON catalogs in pull requests.
No dependency installation or application build is needed.

```yaml
name: Angular i18n
on: [pull_request, workflow_dispatch]
permissions:
  contents: read
jobs:
  catalogs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: axeljaeger/angular-i18n-tools@v1
        with:
          path: apps/my-app
```

The check warns on duplicate source IDs by default. It fails on missing translations,
orphaned keys, invalid catalogs, and project directories without `messages.<locale>.json`
files. Set `duplicate-ids: error` to make duplicate IDs fail the check. The checker
reports all repeated IDs without comparing their source messages; verify that shared
IDs have compatible meanings and placeholders. Annotations link to affected lines;
the job summary gives counts and repair
guidance. Empty catalogs are checked too. Files are never modified.

Choose one independent Angular CLI/Nx project per invocation. Use a matrix for
multiple projects with independent catalogs. XLIFF is outside the action's scope.
Only read access is required, including for fork pull requests.

| Input | Default | Description |
| --- | --- | --- |
| `path` | `.` | Project directory inside the checkout |
| `duplicate-ids` | `warning` | Set to `error` to fail on repeated source IDs |
| `annotations` | `true` | Emit up to ten error or warning annotations |
| `summary` | `true` | Write counts, linked findings and repair guidance (up to 100 locations) |
| `install-dependencies` | `false` | Legacy input; ignored |

[Full documentation](https://github.com/axeljaeger/angular-i18n-tools/blob/main/docs/catalog-checks.md) ·
[Source](https://github.com/axeljaeger/angular-i18n-tools/tree/4b8dc4fa8c4231068f7d61929271110c7173fe37)

This distribution ref contains the action metadata, bundled checker, license and
README. Develop and build the action on the repository's `main` branch.
