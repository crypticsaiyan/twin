# twin site

The website for twin: a custom landing page plus the docs, built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build). It is a standalone package with its own lockfile; the repo root is not a workspace.

## Develop and build

Node 22.12 or newer.

```sh
cd site
pnpm install
pnpm dev       # http://localhost:4321/
pnpm build     # static output in site/dist/
pnpm preview   # serve dist/ (Astro 7 runs it in the background; stop it with `pnpm astro preview stop`)
```

## Where things live

| Path | What |
|---|---|
| `src/pages/index.astro` | Landing page (not a Starlight page) |
| `src/pages/404.astro` | Branded 404 page (Starlight's own 404 route is disabled) |
| `src/components/Terminal.astro` | Typed terminal that replays the recorded echarts runs |
| `src/components/AgentSession.astro` | Timeline of the recorded MCP session |
| `src/components/CopyCommand.astro` | Command with a copy button |
| `src/content/docs/` | Docs pages (Markdown/MDX), one folder per sidebar group |
| `src/content/i18n/en.json` | Starlight UI string overrides (empty) |
| `src/styles/tokens.css` | Brand colors and fonts, shared by the landing page and the docs |
| `src/styles/starlight.css` | Maps the brand tokens onto Starlight's variables |
| `src/assets/logo-*.svg`, `public/favicon.svg` | Logo and favicon |
| `astro.config.mjs` | Site URL, base path, sidebar, Starlight options |

The terminal and the agent session read `../examples/echarts-21538/{replay,bisect,verify,mcp}.txt` at build time, so the landing page always shows the real recorded output. Update those files and rebuild to change it.

### Docs

The sidebar has four groups, each generated from a folder: `start/` (Start here), `guides/` (Guides), `reference/` (Reference) and `examples/` (Case study). Order pages inside a group with `sidebar.order` in the frontmatter. There is no docs index page; `/` is the landing page.

## Deploy

The site is on Vercel at https://twincli.vercel.app (project `twincli`, a static upload of `dist/`). Redeploy with `pnpm deploy` after `vercel login`.

## Change the URL or base path

Both are set at the top of `astro.config.mjs`:

```js
const SITE = process.env.SITE_URL ?? 'https://twincli.vercel.app';
const BASE = process.env.SITE_BASE ?? '/';
```

Edit the defaults, or set them per build, e.g. `SITE_URL=https://example.com SITE_BASE=/twin pnpm build`. Landing page links are built with `link()` from `src/site.ts`, and Starlight handles the docs, so nothing else needs to change.

Light and dark themes share Starlight's `starlight-theme` key in `localStorage`, so a choice made on the landing page carries over to the docs and back.
