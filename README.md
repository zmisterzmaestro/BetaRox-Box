# BetaRox

BetaRox is a standalone browser-based music editor in the BeepBox family. It builds on the open-source work of GoldBox, JummBox, and BeepBox, including John Nesky's original project.

## Develop

Requires Node.js.

```sh
npm run setup
npm run build
npm run preview
```

The build assembles the editor site in `_site/`. Cloudflare deployment settings are kept separate from the source; do not add API keys or passwords to this repository.

## Project layout

- `goldbox/` — the editor and synthesizer source used by BetaRox.
- `site/` — the BetaRox landing page and acknowledgments.
- `worker/` — the site Worker and its private API service connection.

BetaRox's server-side AI and sound experiment code lives in the private `betasoundlabs` repository. The editor's license and upstream notices are retained with the source.
