# Spectral timeline audition fixture

`spectral-timeline-audition.json` is a standalone BetaRox song for trying the spectral timeline path. It uses the native harmonics instrument and carries a `betarox.spectral-timeline` capability for frame-based partial levels, loudness, and moving formant filters.

The pattern includes a short note, a note near the timeline duration, and a longer held note. The timeline changes harmonic balance, loudness, and three moving formant peaks across seven frames over 1.2 seconds.

Importing this JSON replaces the open song, as ordinary song import does. Use it only in a preview/editor session or after saving any song you want to keep. This fixture is for renderer audition; it does not yet test Spectral Lab handoff or automatic new-channel import.
