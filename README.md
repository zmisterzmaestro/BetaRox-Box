# BetaRox

BetaRox is a standalone browser-based music editor in the BeepBox family. It builds on the open-source work of GoldBox, JummBox, and BeepBox, including John Nesky's original project.

## Channel names

Click or tap a numbered **Channel name** field in the left column. Press Enter or tap elsewhere to save, or Escape to cancel. Labels stay with their channels when reordered and are included in native JSON exports.

**File → Copy BetaRox Song URL** includes labels. **File → Copy URL Without Channel Names** shares the same music and tuning with blank labels.

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

## Preset sources

BetaRox includes selected presets adapted from [UltraBox](https://github.com/ultraabox/ultrabox_typescript) and [Slarmoo's Box](https://github.com/slarmoo/slarmoosbox), alongside the GoldBox, JummBox, and BeepBox work described above. Their MIT license notices and contributor credits are documented in the source repositories.
