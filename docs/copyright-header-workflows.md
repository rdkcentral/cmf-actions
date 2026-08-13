# Copyright Header Workflows

This document briefly details how a team can use the two workflow files in `actions/copyright-header-action/` together in a repository
to ensure copyright header compliance

- [`check-headers.yml`](https://github.com/rdkcentral/cmf-actions/blob/453c103e0b9b37f64d4ca75b9144d15efa48a73c/actions/copyright-header-action/check-headers.yml) checks source files and reports via pull request comments which files are missing a copyright header.
- [`apply-headers.yml`](https://github.com/rdkcentral/cmf-actions/blob/453c103e0b9b37f64d4ca75b9144d15efa48a73c/actions/copyright-header-action/apply-headers.yml) adds the missing headers and pushes the changes back to the branch you select.

These files can be found here for now and will be merged soon after some experimental testing [rdkcentral/cmf-actions/pull/22](https://github.com/rdkcentral/cmf-actions/pull/22)

## What The Workflows Do

### Check workflow

The check workflow is intended to run on pull requests.

Functionality:

- Checks the repository for supported source files that do not already contain the expected header
- Creates the expected header template from the first copyright line in the repository `NOTICE` file
- Uses the current repository organisation name extracted from `NOTICE`
- Posts a pull request comment listing files that are missing headers
- Includes the exact header text that will be applied if the apply workflow is run

If all matching files already contain the expected header, the workflow posts a success comment instead.

### Apply workflow

The apply workflow will be ran manually with `workflow_dispatch`.

Functionality:

- Creates the same header template used by the check workflow
- Adds headers to supported files that are missing them
- Commits the changes as `github-actions[bot]`
- Pushes the commit back to the selected branch

## Supported Files

The current include list covers these file types:

- C and C++ source and header files: `.c`, `.cc`, `.cpp`, `.cxx`, `.h`, `.hh`, `.hpp`, `.hxx`
- Go: `.go`
- Shell: `.sh`, `.bash`
- Python: `.py`
- Java: `.java`
- JavaScript and TypeScript: `.js`, `.ts`

This can be edited within the worklfow source code. 
It had been thought of originally to have this be an action input however that could lead to misuse due to misinformed users of the action

## What Is Ignored

The current ignore list explicitly excludes:

- `.github`
- `node_modules`
- `build`
- `dist`

## Recommended Usage In A Repository

Use the two workflow files together:

1. Add both workflow files to the repository.
2. Make sure the repository has a root-level `NOTICE` file with a valid copyright line.
3. Enable the check workflow on pull requests.
4. When the check workflow reports missing headers, run the apply workflow against the pull request branch.
5. Let the workflow push the header-only commit to the same branch.
6. Re-run or wait for the check workflow to confirm the branch is clean.
