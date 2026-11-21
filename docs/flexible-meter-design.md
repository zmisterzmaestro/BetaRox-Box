# Flexible meter design

## Agreed behavior

- Start with selectable, musician-friendly presets, including common odd meters and additive groupings.
- Let an artist adjust the number of visible columns and the note value represented by each column.
- Offer common and compound interpretation. A column can also be dotted, so a compound pulse can represent three eighth-note values without hard-coding a single numerator/denominator convention.
- Draw stronger vertical delineations at group boundaries.
- Keep existing songs and links unchanged unless the artist chooses a new meter.
- Develop on an isolated branch; do not deploy as part of this work.

## Current implementation

`goldbox/synth/Meter.ts` defines a `MeterProfile` as note-value columns plus exclusive group-end indices. The meter dialog exposes grouped presets, column count, each column's note value and dots, and group breaks. Bar duration is converted to the editor's 24-parts-per-quarter-note timebase; the editor draws each column boundary and emphasizes group boundaries. Profiles are preserved in BetaRox URLs and JSON exports. Existing songs without profiles retain their current timing. Undotted values through a 32nd note are exact; dotted values are accepted when their boundaries land on whole parts.

## Integration boundary

The current engine treats each bar as `beatsPerBar * Config.partsPerBeat` parts. The setting appears in playback, song URL serialization, JSON import/export, note editing, selection geometry, and bar rendering. A profile cannot become a real meter by changing its label alone.

The bar duration now flows through the existing `beatsPerBar` arithmetic as a fractional number of quarter-note beats. The remaining integration review should confirm the following consumers and edges:

1. Playback and transport: bar transitions, loop length, and tick-to-bar conversion.
2. Pattern editing: note clamping, snapping, selection, resize, paste, and grid rendering.
3. Conversion behavior: define splice, stretch, and overflow when changing total bar duration, including rollback through undo.
4. Persistence: versioned URL and JSON forms that round-trip profiles. Legacy songs without a profile must continue to use the existing uniform-beat representation.
5. Rendering: group and column boundaries are drawn in the pattern editor; check other relevant views and responsive widths. Resizing must change column widths without changing rhythmic duration.

The key invariant is that profile duration, the editor's final grid boundary, and the engine's bar transition all resolve to the same part count. This is now an interactive branch implementation, but still needs end-to-end browser verification before it should be considered ready for deployment. The shared GoldBox song payload remains unchanged; BetaRox stores the custom profile in a query parameter and rounds the base payload's legacy beat count for compatibility.
