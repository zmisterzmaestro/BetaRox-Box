# BetaRox

BetaRox is a standalone browser-based music editor in the BeepBox family. It builds on the open-source work of GoldBox, JummBox, and BeepBox, including John Nesky's original project.

## Develop

Requires Node.js.

```sh
npm run setup
npm run build
npm run preview
```

The build assembles the editor site in `_site/`. The site Worker can forward server-side API requests to the separate BetaSoundLabs service through a Cloudflare Service Binding. API implementation and credentials do not belong in this repository.

## Project layout

- `goldbox/` — the editor and synthesizer source used by BetaRox.
- `site/` — the BetaRox landing page and acknowledgments.
- `worker/` — the site Worker and password gate.

The upstream MIT notice is retained at `goldbox/LICENSE.md`.
