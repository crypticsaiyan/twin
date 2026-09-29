---
title: Ask for capsules in your issue template
description: Snippets for maintainers to request a twin capsule in bug reports.
sidebar:
  order: 8
---

The cheapest time to get a capsule is when the issue is filed. Add a short request to your bug report template.

## Markdown template

Add this to `.github/ISSUE_TEMPLATE/bug_report.md` (or your equivalent):

````md
If the bug does not reproduce for us, please run the failing command through twin
and attach the file it writes (it records versions and variable names, never secrets):

    npx @crypticsaiyan/twin capture -- <your failing command>
````

## Issue form

For YAML issue forms (`.github/ISSUE_TEMPLATE/bug_report.yml`), add a field:

```yaml
  - type: markdown
    attributes:
      value: |
        **Environment capsule (optional, very helpful).** Run the failing command through twin
        and drag the `twin-capsule.json` it writes into the box below. It records versions,
        the commit, your uncommitted diff and variable names; you review it before it is written.

            npx @crypticsaiyan/twin capture -- <your failing command>
  - type: textarea
    id: capsule
    attributes:
      label: twin capsule
      description: Drag twin-capsule.json here.
```

A file dragged into an issue becomes a `https://github.com/user-attachments/files/…` link. The [GitHub Action](../github-action/) and the [MCP server](../ai-agents/) both find and read capsules from those links.

## Asking in a comment

When an issue is already stuck at "cannot reproduce":

```md
We can't reproduce this. Could you run the failing command through twin and attach
the file it writes? It needs Node 22+, uploads nothing, and shows you everything before
writing it:

    npx @crypticsaiyan/twin capture -- <the command that fails>

If the value of an environment variable might matter and it's not secret, add
`--include-env NAME`.
```

## Tips

- Name the command you want captured if you know it. A single test file gives a faster replay and a sharper signature than the whole suite.
- Capture your own passing run at the same commit (`twin capture -- <same command>`). With both capsules you can run [bisect](../bisect/) right away.
- Link reporters to [Privacy](../../reference/privacy/) if they ask what is recorded.
