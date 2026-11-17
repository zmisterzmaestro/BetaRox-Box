// Standard acoustic sounding ranges, inclusive MIDI coordinates (C4=60).
// Educational, not hard physical limits. Exact preset names deliberately exclude
// synth presets sharing General MIDI numbers. No assumptions for ambiguous models.
// References: https://www.yamaha.com/en/musical_instrument_guide/feature/fingering/
// https://orchestralibrary.com/reftables/rang.html
// Conventional saxophone written Bb3–F#6, no altissimo; bari low A optional, excluded.
// Conservative upper bounds; standard C-foot flute, four-string bass.
export const acousticRanges: Readonly<{[name: string]: readonly [number, number]}> = {
 "piccolo": [74,108], "flute 1": [60,96], "flute 2": [60,96], "FM flute": [60,96],
 "oboe": [58,89], "english horn": [52,84], "clarinet": [50,89], "bassoon": [34,75],
 "soprano sax": [56,88], "alto sax": [49,81], "tenor sax": [44,76], "baritone sax": [37,69],
 "trumpet": [52,82], "muted trumpet": [52,82], "french horn": [35,77],
 "trombone": [40,70], "tuba": [28,65],
 "violin 1": [55,96], "violin 2": [55,96], "fiddle": [55,96], "viola": [48,84],
 "cello": [36,76], "contrabass": [28,60],
 "grand piano 1": [21,108], "grand piano 2": [21,108], "bright piano": [21,108], "honky-tonk piano": [21,108],
 "nylon guitar": [40,83], "steel guitar": [40,83], "jazz guitar": [40,83], "clean guitar": [40,83], "muted guitar": [40,83],
 "acoustic bass": [28,67], "fingered bass": [28,67], "picked bass": [28,67], "fretless bass": [28,67], "slap bass 1": [28,67], "slap bass 2": [28,67],
 "harp": [23,103], "glockenspiel": [79,108], "xylophone": [65,96], "vibraphone": [53,89], "marimba": [45,96],
};
// 14-TET coordinates anchored to the same A4 as 12-TET. Range is nominal, not Hz.
export function outsideAcousticRange(name: string, pitch: number, pitchesPerOctave: number): boolean {
 const range = acousticRanges[name];
 if (!range) return false;
 const midi = pitchesPerOctave === 14 ? 69 + (pitch-80)*12/14 : pitch;
 return midi < range[0]-0.000001 || midi > range[1]+0.000001;
}
