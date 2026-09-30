---
title: GitHub Action reference
description: "Inputs, outputs, permissions and behavior of the crypticsaiyan/twin@main action."
sidebar:
  order: 4
---

`crypticsaiyan/twin@main` verifies pull requests that claim to fix an issue, in the reporter's environment. The walkthrough is in [Check fix PRs in CI](../../guides/github-action/). The source is [`action.yml`](https://github.com/crypticsaiyan/twin/blob/main/action.yml) and [`scripts/action/`](https://github.com/crypticsaiyan/twin/tree/main/scripts/action) (`run.sh`, `find-capsule.sh`, `comment.sh`), tested in `test/action/action.test.ts`.

## Steps

It is a composite action with three steps:

| Step | What runs |
|---|---|
| `actions/setup-node@v4` | Node 22. |
| Install twin | `npx --yes pnpm@10.20.0 install --frozen-lockfile` in the action's directory (`github.action_path`); this also builds twin. |
| Verify in the reporter's environment | `scripts/action/run.sh`, with the inputs and the PR's number, head SHA and head repository clone URL in its environment. |

`run.sh` then:

1. Fails with `twin verify checks pull requests; run it on pull_request events.` when there is no pull request in the event.
2. When `SOLARI_API_KEY` is empty (as on pull requests from forks), prints the notice `No Solari API key (secrets are not passed to pull requests from forks); nothing to verify.`, sets `verdict=skipped` and exits successfully, before looking for a capsule.
3. Uses the `capsule` input if set. Otherwise `find-capsule.sh` lists the PR's closing issue references (`gh pr view --json closingIssuesReferences`) and, for each issue, searches the body and then the comments for the first link matching

   ```text
   https://github\.com/user-attachments/files/[0-9]+/[^][()<>" ]+\.json|https://[^][()<>" ]*capsule[^][()<>" ]*\.json
   ```

   that is, a GitHub issue attachment ending in `.json`, or any https link to a `.json` file with `capsule` in its URL.
4. With no capsule: prints the notice `No twin capsule is attached to an issue this pull request closes; nothing to verify.`, sets `verdict=skipped` and exits successfully.
5. Runs `twin verify "$capsule" --ref "$HEAD_SHA" --repo "$HEAD_REPO" --attempts "$ATTEMPTS" --comment <file>`.
6. If no comment file was written, fails with `twin verify stopped before reaching a verdict (exit <code>).`
7. Reads the verdict from the comment's first line (`<!-- twin-verify verdict=… -->`), sets the `verdict` output, and appends the comment to the job summary (`$GITHUB_STEP_SUMMARY`).
8. If `comment` is `true`, `comment.sh` edits the last PR comment starting with `<!-- twin-verify`, or posts a new one if there is none.
9. Fails with `twin: <verdict> in the reporter's environment.` unless the verdict is `fixed`.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `solari-api-key` | yes | | Solari API key. Store it as a repository secret and pass `${{ secrets.SOLARI_API_KEY }}`. |
| `capsule` | no | `''` | Capsule path or https URL. By default, the capsule attached to an issue the pull request closes. A path resolves against the job's working directory, so check the repository out first for a committed capsule. |
| `attempts` | no | `3` | Runs of the failing command (`twin verify --attempts`). |
| `comment` | no | `true` | Post the verdict as a pull request comment, updated on each push. Any other value skips the comment; the job summary still gets it. |
| `github-token` | no | `${{ github.token }}` | Token for reading issues and writing the comment (used by `gh`). |

## Outputs

| Output | Values |
|---|---|
| `verdict` | `fixed`, `still-failing`, `different-failure`, `flaky`, `inconclusive`, or `skipped` (no Solari key, or no capsule found). Not set when the job fails before a verdict. |

| Verdict | Job result |
|---|---|
| `fixed` | success |
| `still-failing`, `different-failure`, `flaky`, `inconclusive` | failure |
| `skipped` (no key, or no capsule) | success, with a notice |

## Job summary and comment

Every run that reaches a verdict appends the comment's Markdown to the job summary. The comment has the hidden marker line, a headline (`✅ FIXED in the reporter's environment`, `❌ STILL FAILING in the reporter's environment`, `❌ DIFFERENT FAILURE in the reporter's environment`, `⚠️ FLAKY: attempts disagreed` or `⚠️ INCONCLUSIVE: setup failed or an attempt timed out`, or `⚠️ INCONCLUSIVE: the failure did not reproduce without the fix`), a one-line explanation, a table (command, reporter's environment, checked commit, attempts passed, capsule link) and the verify log in a collapsed `<details>` section.

## Permissions

```yaml
permissions:
  contents: read
  issues: read
  pull-requests: write
```

| Permission | Why |
|---|---|
| `contents: read` | Read the pull request and its closing issue references. |
| `issues: read` | Read the linked issues and their comments to find the capsule. |
| `pull-requests: write` | Post and update the verdict comment. |

## Minimal workflow

```yaml title=".github/workflows/twin.yml"
name: twin
on: pull_request
permissions:
  contents: read
  issues: read
  pull-requests: write
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: crypticsaiyan/twin@main
        with:
          solari-api-key: ${{ secrets.SOLARI_API_KEY }}
```

## Requirements and security model

- **Public repository.** The sandbox clones the PR's head repository and commit without credentials.
- **The PR's code runs only inside the Solari sandbox.** The runner installs and runs twin itself; it never checks out or executes the pull request's code.
- **The key stays on the runner.** It is passed to twin as `SOLARI_API_KEY` and never copied into the sandbox.
- **Fork PRs get no secrets** under the plain `pull_request` trigger, so the check works for same-repository branches, which is how coding agents usually open PRs. On a fork PR the key is empty, so the action skips with a notice and `verdict=skipped` instead of failing.
- The runner needs `bash` and the GitHub CLI (`gh`), both present on GitHub-hosted Ubuntu runners.
