# Catalog checks for pull requests

Run Angular runtime JSON catalog checks directly in GitHub Actions. The released
action includes its checker: no pnpm, npm installation or application build is
needed in the consuming workflow.

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

`path` selects one independent Angular CLI/Nx project, relative to the checked-out
repository. Check projects with independent IDs/catalogs separately, for example
with a matrix. The action does not infer every project or target language from
Angular/Nx configuration. It scans custom IDs in HTML and `$localize` messages,
and existing `messages.<locale>.json` files. XLIFF and machine translation are
outside its scope.

## Findings and GitHub experience

- Duplicate source IDs, missing translations and orphaned keys fail the check.
- Empty catalogs still define a locale: their missing translations are reported.
- Invalid JSON/catalog values and paths with no runtime catalogs fail clearly.
- Up to ten blocking error annotations point at repository-relative source or
  catalog lines, including when the project is in a subdirectory.
- The job summary contains counts, linked findings (up to 100 locations), and
  repair guidance. Duplicated IDs are reported at each source occurrence.

No write permission, PR comments or additional tokens are required. The action
does not modify files or create translations. A normal read-only
`pull_request` workflow works with forks; do not use `pull_request_target` to run
untrusted source code with elevated permissions.

Inputs:

| Input | Default | Meaning |
| --- | --- | --- |
| `path` | `.` | Project directory inside the checkout |
| `annotations` | `true` | Show blocking findings on affected file lines |
| `summary` | `true` | Write the job summary |
| `install-dependencies` | `false` | Legacy compatibility flag; ignored by the bundled action |

## Demo

`examples/catalog-checks-demo` is clean on the default branch. The
[public demo PR #33](https://github.com/axeljaeger/angular-i18n-tools/pull/33)
adds three intentional mistakes: one missing German translation, one orphaned
French key, and one duplicated source ID. Expect four annotated locations,
because the duplicated ID has two source occurrences. The PR remains open and
must not be merged. Other demos and their builds stay unaffected.

The workflow `.github/workflows/catalog-checks.yml` consumes the released action
exactly as an external project would. A manual run on the default branch is the
[passing counterpart](https://github.com/axeljaeger/angular-i18n-tools/actions/runs/41662696502)
to the failing PR.

## Local CLI

```sh
npx @angular-i18n-tools/core@0.0.3 apps/my-app
```

The CLI returns 0 for complete catalogs and 1 for findings. `--github-annotations`
uses `GITHUB_WORKSPACE` or `--annotation-root <directory>` for annotation paths.
`--github-summary` writes to `GITHUB_STEP_SUMMARY` when used in GitHub Actions.

## Releases and Marketplace

The action release tag `action-v1.0.0` and major alias `v1` include the tested
bundle in `dist/catalog-action.mjs`. Source development builds it with
`pnpm run build:action`; release consumers never install repository dependencies.
The release checkout contains only the action metadata, bundle, license and
action README. Action release tags do not trigger npm package publication.

The GitHub Marketplace listing is separate from a GitHub release. Publishing the
listing requires the repository owner's Marketplace agreement and the **Publish
this Action to the GitHub Marketplace** option on the release. This acceptance
is not automated. See [GitHub's instructions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace).

The intended listing is
<https://github.com/marketplace/actions/angular-i18n-tools-check>. Until the owner
publishes it, the project page links to a clearly marked Marketplace search
rather than presenting an unavailable listing as an installation.
