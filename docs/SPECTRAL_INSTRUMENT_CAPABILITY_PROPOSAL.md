# Spectral instrument capability model — proposal

**Status:** design proposal; no playback or file-format behavior is implemented by this document.

## Purpose

BetaRox should be able to add optional sound capabilities to any instrument, including a copy of a native preset. Spectral Lab is one source of those capabilities, not a special instrument class. Existing BeepBox, Slarmoo, and BetaRox instruments must keep their current behavior when the new data is absent.

This proposal is a reviewable design slice. It does not change the active channel-import drafts (#27 and #39), merge them, or deploy anything.

## Proposed data shape

Add an optional `capabilities` array to an instrument's JSON representation:

```json
{
  "type": "harmonics",
  "harmonics": ["... existing instrument data ..."],
  "capabilities": [
    {
      "id": "betarox.spectral-timeline",
      "version": 1,
      "data": {
        "durationSeconds": 1.25,
        "frames": [
          { "timeSeconds": 0, "loudness": 0.82, "harmonics": ["28 normalized values"] },
          { "timeSeconds": 0.25, "loudness": 0.67, "harmonics": ["28 normalized values"] }
        ]
      }
    }
  ]
}
```

The example abbreviates the arrays; an implementation must use numeric values, never strings. Version 1 is proposed to use 28 normalized harmonic amplitudes and normalized loudness per frame. Frame times are seconds from note onset. A capability record is independent of `Instrument.type`, so copied native instruments can carry the same capability. Existing static harmonics and native envelopes remain intact as the fallback and as the instrument's base sound.

### Defaults and unknown data

- No `capabilities` field means the instrument behaves exactly as it does now.
- A known capability ID and supported version can be interpreted by BetaRox.
- Unknown IDs or versions should not be played as if understood. Preserve them opaquely when loading and saving, so a newer BetaRox does not lose data merely because an older BetaRox build cannot render it.
- Malformed known data should be rejected or omitted with a clear import/save error; it must not partially mutate the current song.
- Do not infer a timeline from old static harmonics data.

## Serialization boundary

`Instrument.toJsonObject()` and `Instrument.fromJsonObject()` in `goldbox/synth/synth.ts` explicitly write and read instrument fields. Unknown JSON keys are therefore dropped on a BetaRox load/save round trip unless the instrument model retains them.

The editor also stores songs as compact links: `Song.toBase64String()` in the same file feeds share URLs and `SongDocument` history/recovery. A JSON-only capability would disappear from those paths. The eventual implementation must encode capability records in compact songs as well as JSON and verify that history undo/redo, recovery, and share URLs round-trip them.

Proposed compact encoding: add a new BetaRox-only tag carrying a length-prefixed, URI-escaped JSON capability payload associated with the current instrument. Emit the tag and a newer compact-format version only for songs that actually contain capability data; ordinary songs should retain their existing compact encoding byte-for-byte. Because older BetaRox parsers reject unknown tags, old-editor compatibility for new capability songs is not promised by this proposal and must be communicated separately. BeepBox/Slarmoo inbound song decoding remains a separate compatibility path and must not be changed by this extension.

The exact tag, length bound, encoding size, and migration policy require review before implementation. A large timeline may make URL encoding impractical; if so, the transport may need a bounded/quantized binary payload or a separate downloadable instrument format while keeping JSON as the full-fidelity form.

Slarmoo's 1.4.15 source shows two distinct fallback routes. Its editor sends an encoded full-song URL to the selected shortener; Wackybox is the default, and the client rejects encoded inputs above 128,000 characters. Its HTML route creates a redirector file that contains the full song URL and recommends uploading that file to File Garden or GitHub. Neither route compresses the song data. The patch notes credit `hacktrixapii` in the Wackybox switch note, while the integration commit is authored by `slarmoo`; the available sources do not specify whether that credit is for the service, the suggestion, or another contribution. The source paths are [SongEditor.ts](https://github.com/slarmoo/slarmoosbox/blob/main/editor/SongEditor.ts#L5410-L5458), [shortener.html](https://github.com/slarmoo/slarmoosbox/blob/main/website/shortener.html#L101-L164), and [ExportPrompt.ts](https://github.com/slarmoo/slarmoosbox/blob/main/editor/ExportPrompt.ts#L1198-L1228); the related integration commit is [77a835c](https://github.com/slarmoo/slarmoosbox/commit/77a835c62a3c3777a1171b8407c428155f548453).

BetaRox already has a TinyURL call in `goldbox/editor/SongEditor.ts` (`shortenUrl`), so the shortener flow is not wholly new here. A follow-up can add a bounded Wackybox option and an HTML redirector export, following Slarmoo's layered pattern. Before adopting an external shortener, verify current service availability and terms; the source proves that the full encoded song URL is sent to the service, but does not establish Wackybox's retention policy. [Slarmoo's Box 1.4.15 patch notes](https://slarmoo.github.io/slarmoosbox/website/patch_notes.html).

## Playback direction to evaluate

One playback design to evaluate is to interpolate the frame values over elapsed note time and use them to update the harmonic profile and loudness while the note is active. Keep this as an additive playback path selected only when a supported timeline capability is present; all ordinary instruments continue through existing synthesis unchanged.

The timeline should retain the full captured duration. A held note should be able to play through that duration. If a note ends first, offer two behaviors for audition:

- **Trim:** play at recorded rate, then stop at note end with a short fade to avoid a click.
- **Fit:** compress the timeline so its full duration fits within the note.

These are design directions, not settled playback rules. Test them against BetaRox's note quantization, instrument envelopes, transition behavior, and release processing before choosing the exact endpoint and fade. In particular, confirm whether the timeline holds its final frame through the normal release or follows another release rule.

The existing Spectral Lab preview, static harmonics handoff, and experimental time-varying audition must be described separately. The preview is approximate; the current editor handoff carries a static harmonics instrument; a timeline-capable editor path would be a new feature and must not be implied until it is implemented and auditioned.

## Compatibility and acceptance checks

1. Representative BeepBox and Slarmoo songs load and play in BetaRox with no new capability data.
2. Existing presets and old BetaRox songs sound and serialize as before.
3. A copied native preset can opt into a capability without changing its source preset.
4. A known capability survives JSON, compact link, history undo/redo, and recovery round trips.
5. Unknown capability records survive a BetaRox load/save round trip, even when the running build cannot play them.
6. Trim and Fit are auditioned with short notes, long held notes, and the existing release envelope before their behavior is finalized.
7. The in-song import adds a new channel and leaves existing channels, patterns, notes, meter, and tuning unchanged; a full channel limit leaves the song unchanged.

## Rollback boundary

Keep capability format/playback work on its own branch and pull request, separate from handoff PRs #27 and #39. Closing the unmerged design PR discards this proposal from the project branch; if merged later, revert its single documentation commit. Implementation should remain in separate commits so the format layer can be reverted independently from playback and UI work.
