Warning: truncated output (original token count: 164629)
Total output lines: 11348

// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { Dictionary, DictionaryArray, Key, FilterType, EnvelopeType, LFOEnvelopeTypes, RandomEnvelopeTypes, InstrumentType, EffectType, EnvelopeComputeIndex, Transition, Unison, Chord, Vibrato, Envelope, AutomationTarget, Config, getDrumWave, drawNoiseSpectrum, getArpeggioPitchIndex, performIntegralOld, getPulseWidthRatio, effectsIncludeTransition, effectsIncludeChord, effectsIncludePitchShift, effectsIncludeDetune, effectsIncludeVibrato, effectsIncludeNoteFilter, effectsIncludeDistortion, effectsIncludeBitcrusher, effectsIncludePanning, effectsIncludeChorus, effectsIncludeEcho, effectsIncludeReverb, OperatorWave } from "./SynthConfig";
import { EditorConfig } from "../editor/EditorConfig";
import { scaleElementsByFactor, inverseRealFourierTransform } from "./FFT";
import { Deque } from "./Deque";
import { events } from "../global/Events";
import { FilterCoefficients, FrequencyResponse, DynamicBiquadFilter } from "./filtering";
import { MeterProfile, meterDurationParts, normalizeMeterProfile } from "./Meter";

declare global {
    interface Window {
        AudioContext: any;
        webkitAudioContext: any;
    }
}

const epsilon: number = (1.0e-24); // For detecting and avoiding float denormals, which have poor performance.

// For performance debugging:
//let samplesAccumulated: number = 0;
//let samplePerformance: number = 0;

export function clamp(min: number, max: number, val: number): number {
    max = max - 1;
    if (val <= max) {
        if (val >= min) return val;
        else return min;
    } else {
        return max;
    }
}

function validateRange(min: number, max: number, val: number): number {
    if (min <= val && val <= max) return val;
    throw new Error(`Value ${val} not in range [${min}, ${max}]`);
}

const enum CharCode {
    SPACE = 32,
    HASH = 35,
    PERCENT = 37,
    AMPERSAND = 38,
    PLUS = 43,
    DASH = 45,
    DOT = 46,
    NUM_0 = 48,
    NUM_1 = 49,
    NUM_2 = 50,
    NUM_3 = 51,
    NUM_4 = 52,
    NUM_5 = 53,
    NUM_6 = 54,
    NUM_7 = 55,
    NUM_8 = 56,
    NUM_9 = 57,
    EQUALS = 61,
    A = 65,
    B = 66,
    C = 67,
    D = 68,
    E = 69,
    F = 70,
    G = 71,
    H = 72,
    I = 73,
    J = 74,
    K = 75,
    L = 76,
    M = 77,
    N = 78,
    O = 79,
    P = 80,
    Q = 81,
    R = 82,
    S = 83,
    T = 84,
    U = 85,
    V = 86,
    W = 87,
    X = 88,
    Y = 89,
    Z = 90,
    UNDERSCORE = 95,
    a = 97,
    b = 98,
    c = 99,
    d = 100,
    e = 101,
    f = 102,
    g = 103,
    h = 104,
    i = 105,
    j = 106,
    k = 107,
    l = 108,
    m = 109,
    n = 110,
    o = 111,
    p = 112,
    q = 113,
    r = 114,
    s = 115,
    t = 116,
    u = 117,
    v = 118,
    w = 119,
    x = 120,
    y = 121,
    z = 122,
    LEFT_CURLY_BRACE = 123,
    RIGHT_CURLY_BRACE = 125,
}

const enum SongTagCode {
    beatCount = CharCode.a, // added in song url version 2
    bars = CharCode.b, // added in 2
    vibrato = CharCode.c, // added in 2, DEPRECATED
    fadeInOut = CharCode.d, // added in 3 for transition, switched to fadeInOut in 9
    loopEnd = CharCode.e, // added in 2
    eqFilter = CharCode.f, // added in 3
    barCount = CharCode.g, // added in 3
    unison = CharCode.h, // added in 2
    instrumentCount = CharCode.i, // added in 3
    patternCount = CharCode.j, // added in 3
    key = CharCode.k, // added in 2
    loopStart = CharCode.l, // added in 2
    reverb = CharCode.m, // added in 5, DEPRECATED
    channelCount = CharCode.n, // added in 6
    channelOctave = CharCode.o, // added in 3
    patterns = CharCode.p, // added in 2
    effects = CharCode.q, // added in 7
    rhythm = CharCode.r, // added in 2
    scale = CharCode.s, // added in 2
    tempo = CharCode.t, // added in 2
    preset = CharCode.u, // added in 7
    volume = CharCode.v, // added in 2
    wave = CharCode.w, // added in 2

    filterResonance = CharCode.y, // added in 7, DEPRECATED
    drumsetEnvelopes = CharCode.z, // added in 7 for filter envelopes, still used for drumset envelopes
    algorithm = CharCode.A, // added in 6
    feedbackAmplitude = CharCode.B, // added in 6
    chord = CharCode.C, // added in 7, DEPRECATED
    detune = CharCode.D, // [JB], added in 3(?), DEPRECATED
    envelopes = CharCode.E, // added in 6 for FM operator envelopes, repurposed in 9 for general envelopes.
    feedbackType = CharCode.F, // added in 6
    arpeggioSpeed = CharCode.G, // [JB], added in 3, DEPRECATED
    harmonics = CharCode.H, // added in 7
    stringSustain = CharCode.I, // added in 9
    temperament = CharCode.J, // BetaRox historical tuning, only in B-prefixed links.
    referenceA4Hz = CharCode.K, // BetaRox concert pitch, only in B-prefixed links.
    envelopeSettings = CharCode.Z, // BetaRox / Slarmoo-style per-envelope parameters.

    pan = CharCode.L, // added between 8 and 9, DEPRECATED
    customChipWave = CharCode.M, // [JB], added in 1(?)
    songTitle = CharCode.N, // [JB], added in 1(?)
    limiterSettings = CharCode.O, // [JB], added in 3(?)

    operatorAmplitudes = CharCode.P, // added in 6
    operatorFrequencies = CharCode.Q, // added in 6
    operatorWaves = CharCode.R, // [JB], added in 4
    spectrum = CharCode.S, // added in 7
    startInstrument = CharCode.T, // added in 6
    channelNames = CharCode.U, // [JB], added in 4(?)
    feedbackEnvelope = CharCode.V, // added in 6, DEPRECATED
    pulseWidth = CharCode.W, // added in 7
    instrumentOctave = CharCode.Y, // BetaRox optional octave offset
    aliases = CharCode.X, // [JB], added in 4, DEPRECATED

}

const base64IntToCharCode: ReadonlyArray<number> = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 45, 95];
const base64CharCodeToInt: ReadonlyArray<number> = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 62, 62, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0, 0, 0, 0, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 0, 0, 0, 0, 63, 0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 0, 0, 0, 0, 0]; // 62 could be represented by either "-" or "." for historical reasons. New songs should use "-".

class BitFieldReader {
    private _bits: number[] = [];
    private _readIndex: number = 0;

    constructor(source: string, startIndex: number, stopIndex: number) {
        for (let i: number = startIndex; i < stopIndex; i++) {
            const value: number = base64CharCodeToInt[source.charCodeAt(i)];
            this._bits.push((value >> 5) & 0x1);
            this._bits.push((value >> 4) & 0x1);
            this._bits.push((value >> 3) & 0x1);
            this._bits.push((value >> 2) & 0x1);
            this._bits.push((value >> 1) & 0x1);
            this._bits.push(value & 0x1);
        }
    }

    public read(bitCount: number): number {
        let result: number = 0;
        while (bitCount > 0) {
            result = result << 1;
            result += this._bits[this._readIndex++];
            bitCount--;
        }
        return result;
    }

    public readLongTail(minValue: number, minBits: number): number {
        let result: number = minValue;
        let numBits: number = minBits;
        while (this._bits[this._readIndex++]) {
            result += 1 << numBits;
            numBits++;
        }
        while (numBits > 0) {
            numBits--;
            if (this._bits[this._readIndex++]) {
                result += 1 << numBits;
            }
        }
        return result;
    }

    public readPartDuration(): number {
        return this.readLongTail(1, 3);
    }

    public readLegacyPartDuration(): number {
        return this.readLongTail(1, 2);
    }

    public readPinCount(): number {
        return this.readLongTail(1, 0);
    }

    public readPitchInterval(): number {
        if (this.read(1)) {
            return -this.readLongTail(1, 3);
        } else {
            return this.readLongTail(1, 3);
        }
    }
}

class BitFieldWriter {
    private _index: number = 0;
    private _bits: number[] = [];

    public clear() {
        this._index = 0;
    }

    public write(bitCount: number, value: number): void {
        bitCount--;
        while (bitCount >= 0) {
            this._bits[this._index++] = (value >>> bitCount) & 1;
            bitCount--;
        }
    }

    public writeLongTail(minValue: number, minBits: number, value: number): void {
        if (value < minValue) throw new Error("value out of bounds");
        value -= minValue;
        let numBits: number = minBits;
        while (value >= (1 << numBits)) {
            this._bits[this._index++] = 1;
            value -= 1 << numBits;
            numBits++;
        }
        this._bits[this._index++] = 0;
        while (numBits > 0) {
            numBits--;
            this._bits[this._index++] = (value >>> numBits) & 1;
        }
    }

    public writePartDuration(value: number): void {
        this.writeLongTail(1, 3, value);
    }

    public writePinCount(value: number): void {
        this.writeLongTail(1, 0, value);
    }

    public writePitchInterval(value: number): void {
        if (value < 0) {
            this.write(1, 1); // sign
            this.writeLongTail(1, 3, -value);
        } else {
            this.write(1, 0); // sign
            this.writeLongTail(1, 3, value);
        }
    }

    public concat(other: BitFieldWriter): void {
        for (let i: number = 0; i < other._index; i++) {
            this._bits[this._index++] = other._bits[i];
        }
    }

    public encodeBase64(buffer: number[]): number[] {

        for (let i: number = 0; i < this._index; i += 6) {
            const value: number = (this._bits[i] << 5) | (this._bits[i + 1] << 4) | (this._bits[i + 2] << 3) | (this._bits[i + 3] << 2) | (this._bits[i + 4] << 1) | this._bits[i + 5];
            buffer.push(base64IntToCharCode[value]);
        }
        return buffer;
    }

    public lengthBase64(): number {
        return Math.ceil(this._index / 6);
    }
}

export interface NotePin {
    interval: number;
    time: number;
    size: number;
}

export function makeNotePin(interval: number, time: number, size: number): NotePin {
    return { interval: interval, time: time, size: size };
}

export class Note {
    public pitches: number[];
    public pins: NotePin[];
    public start: number;
    public end: number;
    public continuesLastPattern: boolean;

    public constructor(pitch: number, start: number, end: number, size: number, fadeout: boolean = false) {
        this.pitches = [pitch];
        this.pins = [makeNotePin(0, 0, size), makeNotePin(0, end - start, fadeout ? 0 : size)];
        this.start = start;
        this.end = end;
        this.continuesLastPattern = false;
    }

    public pickMainInterval(): number {
        let longestFlatIntervalDuration: number = 0;
        let mainInterval: number = 0;
        for (let pinIndex: number = 1; pinIndex < this.pins.length; pinIndex++) {
            const pinA: NotePin = this.pins[pinIndex - 1];
            const pinB: NotePin = this.pins[pinIndex];
            if (pinA.interval == pinB.interval) {
                const duration: number = pinB.time - pinA.time;
                if (longestFlatIntervalDuration < duration) {
                    longestFlatIntervalDuration = duration;
                    mainInterval = pinA.interval;
                }
            }
        }
        if (longestFlatIntervalDuration == 0) {
            let loudestSize: number = 0;
            for (let pinIndex: number = 0; pinIndex < this.pins.length; pinIndex++) {
                const pin: NotePin = this.pins[pinIndex];
                if (loudestSize < pin.size) {
                    loudestSize = pin.size;
                    mainInterval = pin.interval;
                }
            }
        }
        return mainInterval;
    }

    public clone(): Note {
        const newNote: Note = new Note(-1, this.start, this.end, 3);
        newNote.pitches = this.pitches.concat();
        newNote.pins = [];
        for (const pin of this.pins) {
            newNote.pins.push(makeNotePin(pin.interval, pin.time, pin.size));
        }
        newNote.continuesLastPattern = this.continuesLastPattern;
        return newNote;
    }

    public getEndPinIndex(part: number): number {
        let endPinIndex: number;
        for (endPinIndex = 1; endPinIndex < this.pins.length - 1; endPinIndex++) {
            if (this.pins[endPinIndex].time + this.start > part) break;
        }
        return endPinIndex;
    }
}

export class Pattern {
    public notes: Note[] = [];
    public readonly instruments: number[] = [0];

    public cloneNotes(): Note[] {
        const result: Note[] = [];
        for (const note of this.notes) {
            result.push(note.clone());
        }
        return result;
    }

    public reset(): void {
        this.notes.length = 0;
        this.instruments[0] = 0;
        this.instruments.length = 1;
    }

    public toJsonObject(song: Song, channel: Channel, isModChannel: boolean): any {
        const noteArray: Object[] = [];
        for (const note of this.notes) {
            // Only one ins per pattern is enforced in mod channels.
            let instrument: Instrument = channel.instruments[this.instruments[0]];
            let mod: number = Math.max(0, Config.modCount - note.pitches[0] - 1);
            let volumeCap: number = song.getVolumeCapForSetting(isModChannel, instrument.modulators[mod], instrument.modFilterTypes[mod]);
            const pointArray: Object[] = [];
            for (const pin of note.pins) {
                let useVol: number = isModChannel ? Math.round(pin.size) : Math.round(pin.size * 100 / volumeCap);
                pointArray.push({
                    "tick": (pin.time + note.start) * Config.rhythms[song.rhythm].stepsPerBeat / Config.partsPerBeat,
                    "pitchBend": pin.interval,
                    "volume": useVol,
                    "forMod": isModChannel,
                });
            }

            const noteObject: any = {
                "pitches": note.pitches,
                "points": pointArray,
            };
            if (note.start == 0) {
                noteObject["continuesLastPattern"] = note.continuesLastPattern;
            }
            noteArray.push(noteObject);
        }

        const patternObject: any = { "notes": noteArray };
        if (song.patternInstruments) {
            patternObject["instruments"] = this.instruments.map(i => i + 1);
        }
        return patternObject;
    }

    public fromJsonObject(patternObject: any, song: Song, channel: Channel, importedPartsPerBeat: number, isNoiseChannel: boolean, isModChannel: boolean): void {
        if (song.patternInstruments) {
            if (Array.isArray(patternObject["instruments"])) {
                const instruments: any[] = patternObject["instruments"];
                const instrumentCount: number = clamp(Config.instrumentCountMin, song.getMaxInstrumentsPerPatternForChannel(channel) + 1, instruments.length);
                for (let j: number = 0; j < instrumentCount; j++) {
                    this.instruments[j] = clamp(0, channel.instruments.length, (instruments[j] | 0) - 1);
                }
                this.instruments.length = instrumentCount;
            } else {
                this.instruments[0] = clamp(0, channel.instruments.length, (patternObject["instrument"] | 0) - 1);
                this.instruments.length = 1;
            }
        }

        if (patternObject["notes"] && patternObject["notes"].length > 0) {
            const maxNoteCount: number = Math.min(song.beatsPerBar * Config.partsPerBeat * (isModChannel ? Config.modCount : 1), patternObject["notes"].length >>> 0);

            // TODO: Consider supporting notes specified in any timing order, sorting them and truncating as necessary.
            //let tickClock: number = 0;
            for (let j: number = 0; j < patternObject["notes"].length; j++) {
                if (j >= maxNoteCount) break;

                const noteObject = patternObject["notes"][j];
                if (!noteObject || !noteObject["pitches"] || !(noteObject["pitches"].length >= 1) || !noteObject["points"] || !(noteObject["points"].length >= 2)) {
                    continue;
                }

                const note: Note = new Note(0, 0, 0, 0);
                note.pitches = [];
                note.pins = [];

                for (let k: number = 0; k < noteObject["pitches"].length; k++) {
                    const pitch: number = noteObject["pitches"][k] | 0;
                    if (note.pitches.indexOf(pitch) != -1) continue;
                    note.pitches.push(pitch);
                    if (note.pitches.length >= Config.maxChordSize) break;
                }
                if (note.pitches.length < 1) continue;

                //let noteClock: number = tickClock;
                let startInterval: number = 0;
                for (let k: number = 0; k < noteObject["points"].length; k++) {
                    const pointObject: any = noteObject["points"][k];
                    if (pointObject == undefined || pointObject["tick"] == undefined) continue;
                    const interval: number = (pointObject["pitchBend"] == undefined) ? 0 : (pointObject["pitchBend"] | 0);

                    const time: number = Math.round((+pointObject["tick"]) * Config.partsPerBeat / importedPartsPerBeat);

                    let instrument: Instrument = channel.instruments[this.instruments[0]];
                    let mod: number = Math.max(0, Config.modCount - note.pitches[0] - 1);

                    // Only one instrument per pattern allowed in mod channels.
                    let volumeCap: number = song.getVolumeCapForSetting(isModChannel, instrument.modulators[mod], instrument.modFilterTypes[mod]);

                    // The strange volume formula used for notes is not needed for mods. Some rounding errors were possible.
                    // A "forMod" signifier was added to new JSON export to detect when the higher precision export was used in a file.
                    let size: number;
                    if (pointObject["volume"] == undefined) {
                        size = volumeCap;
                    } else if (pointObject["forMod"] == undefined) {
                        size = Math.max(0, Math.min(volumeCap, Math.round((pointObject["volume"] | 0) * volumeCap / 100)));
                    }
                    else {
                        size = ((pointObject["forMod"] | 0) > 0) ? Math.round(pointObject["volume"] | 0) : Math.max(0, Math.min(volumeCap, Math.round((pointObject["volume"] | 0) * volumeCap / 100)));
                    }

                    if (time > song.beatsPerBar * Config.partsPerBeat) continue;
                    if (note.pins.length == 0) {
                        //if (time < noteClock) continue;
                        note.start = time;
                        startInterval = interval;
                    } else {
                        //if (time <= noteClock) continue;
                    }
                    //noteClock = time;

                    note.pins.push(makeNotePin(interval - startInterval, time - note.start, size));
                }
                if (note.pins.length < 2) continue;

                note.end = note.pins[note.pins.length - 1].time + note.start;

                const maxPitch: number = isNoiseChannel ? Config.drumCount - 1 : song.maxPitch;
                let lowestPitch: number = maxPitch;
                let highestPitch: number = 0;
                for (let k: number = 0; k < note.pitches.length; k++) {
                    note.pitches[k] += startInterval;
                    if (note.pitches[k] < 0 || note.pitches[k] > maxPitch) {
                        note.pitches.splice(k, 1);
                        k--;
                    }
                    if (note.pitches[k] < lowestPitch) lowestPitch = note.pitches[k];
                    if (note.pitches[k] > highestPitch) highestPitch = note.pitches[k];
                }
                if (note.pitches.length < 1) continue;

                for (let k: number = 0; k < note.pins.length; k++) {
                    const pin: NotePin = note.pins[k];
                    if (pin.interval + lowestPitch < 0) pin.interval = -lowestPitch;
                    if (pin.interval + highestPitch > maxPitch) pin.interval = maxPitch - highestPitch;
                    if (k >= 2) {
                        if (pin.interval == note.pins[k - 1].interval &&
                            pin.interval == note.pins[k - 2].interval &&
                            pin.size == note.pins[k - 1].size &&
                            pin.size == note.pins[k - 2].size) {
                            note.pins.splice(k - 1, 1);
                            k--;
                        }
                    }
                }

                if (note.start == 0) {
                    note.continuesLastPattern = (noteObject["continuesLastPattern"] === true);
                } else {
                    note.continuesLastPattern = false;
                }

                this.notes.push(note);
            }
        }
    }
}

export class Operator {
    public frequency: number = 4;
    public amplitude: number = 0;
    public waveform: number = 0;
    public pulseWidth: number = 0.5;

    constructor(index: number) {
        this.reset(index);
    }

    public reset(index: number): void {
        this.frequency = 4; //defualt to 1x
        this.amplitude = (index <= 1) ? Config.operatorAmplitudeMax : 0;
        this.waveform = 0;
        this.pulseWidth = 5;
    }

    public copy(other: Operator): void {
        this.frequency = other.frequency;
        this.amplitude = other.amplitude;
        this.waveform = other.waveform;
        this.pulseWidth = other.pulseWidth;
    }
}

export class CustomAlgorithm {
    public name: string = "";
    public carrierCount: number = 0;
    public modulatedBy: number[][] = [[], [], [], [], [], []];
    public associatedCarrier: number[] = [];

    constructor(){
        this.fromPreset(1);
    }

    public set(carriers: number, modulation: number[][]) {
        this.reset();
        this.carrierCount = carriers;
        for (let i = 0; i < this.modulatedBy.length; i++) {
            this.modulatedBy[i] = modulation[i];
            if (i < carriers) {
                this.associatedCarrier[i] = i+1;
            }
            this.name += (i+1);
            for (let j = 0; j < modulation[i].length;j++) {
                this.name += modulation[i][j];
                if (modulation[i][j] > carriers-1) {
                    this.associatedCarrier[modulation[i][j] - 1] = i + 1;
                }
                this.name += ",";
            }
            if (i < carriers) {
                this.name += "|";
            } else {
                this.name += ".";
            }
        }
    }

    public reset(): void {
        this.name = ""
        this.carrierCount = 1;
        this.modulatedBy = [[2, 3, 4, 5, 6], [], [], [], [], []];
        this.associatedCarrier = [1, 1, 1, 1, 1, 1];
    }

    public copy(other: CustomAlgorithm): void {
        this.name = other.name;
        this.carrierCount = other.carrierCount;
        this.modulatedBy = other.modulatedBy;
        this.associatedCarrier = other.associatedCarrier;
    }

    public fromPreset(other: number): void {
        this.reset();
        let preset = Config.algorithms6Op[other]
        this.name = preset.name;
        this.carrierCount = preset.carrierCount;
        for (var i = 0; i < preset.modulatedBy.length; i++) {
            this.modulatedBy[i] = Array.from(preset.modulatedBy[i]);
            this.associatedCarrier[i] = preset.associatedCarrier[i];
        }
    }
}

export class CustomFeedBack { //feels redunant
    public name: string = "";
    public indices: number[][] = [[], [], [], [], [], []];

    constructor() {
        this.fromPreset(1);
    }

    public set(inIndices: number[][]) {
        this.reset();
        for (let i = 0; i < this.indices.length; i++) {
            this.indices[i] = inIndices[i];
            for (let j = 0; j < inIndices[i].length; j++) {
                this.name += inIndices[i][j];
                this.name += ",";
            }
            this.name += ".";
        }
    }

    public reset(): void {
        this.reset;
        this.name = "";
        this.indices = [[1], [], [], [], [], []];
    }

    public copy(other: CustomFeedBack): void {
        this.name = other.name;
        this.indices = other.indices;
    }

    public fromPreset(other: number): void {
        this.reset();
        let preset = Config.feedbacks6Op[other]
        for (var i = 0; i < preset.indices.length; i++) {
            this.indices[i] = Array.from(preset.indices[i]);
            for (let j = 0; j < preset.indices[i].length; j++) {
                this.name += preset.indices[i][j];
                this.name += ",";
            }
            this.name += ".";
        }
    }
}

export class SpectrumWave {
    public spectrum: number[] = [];
    public hash: number = -1;

    constructor(isNoiseChannel: boolean) {
        this.reset(isNoiseChannel);
    }

    public reset(isNoiseChannel: boolean): void {
        for (let i: number = 0; i < Config.spectrumControlPoints; i++) {
            if (isNoiseChannel) {
                this.spectrum[i] = Math.round(Config.spectrumMax * (1 / Math.sqrt(1 + i / 3)));
            } else {
                const isHarmonic: boolean = i == 0 || i == 7 || i == 11 || i == 14 || i == 16 || i == 18 || i == 21 || i == 23 || i >= 25;
                this.spectrum[i] = isHarmonic ? Math.max(0, Math.round(Config.spectrumMax * (1 - i / 30))) : 0;
            }
        }
        this.markCustomWaveDirty();
    }

    public markCustomWaveDirty(): void {
        const hashMult: number = Synth.fittingPowerOfTwo(Config.spectrumMax + 2) - 1;
        let hash: number = 0;
        for (const point of this.spectrum) hash = ((hash * hashMult) + point) >>> 0;
        this.hash = hash;
    }
}

class SpectrumWaveState {
    public wave: Float32Array | null = null;
    private _hash: number = -1;

    public getCustomWave(settings: SpectrumWave, lowestOctave: number): Float32Array {
        if (this._hash == settings.hash) return this.wave!;
        this._hash = settings.hash;

        const waveLength: number = Config.spectrumNoiseLength;
        if (this.wave == null || this.wave.length != waveLength + 1) {
            this.wave = new Float32Array(waveLength + 1);
        }
        const wave: Float32Array = this.wave;

        for (let i: number = 0; i < waveLength; i++) {
            wave[i] = 0;
        }

        const highestOctave: number = 14;
        const falloffRatio: number = 0.25;
        // Nudge the 2/7 and 4/7 control points so that they form harmonic intervals.
        const pitchTweak: number[] = [0, 1 / 7, Math.log2(5 / 4), 3 / 7, Math.log2(3 / 2), 5 / 7, 6 / 7];
        function controlPointToOctave(point: number): number {
            return lowestOctave + Math.floor(point / Config.spectrumControlPointsPerOctave) + pitchTweak[(point + Config.spectrumControlPointsPerOctave) % Config.spectrumControlPointsPerOctave];
        }

        let combinedAmplitude: number = 1;
        for (let i: number = 0; i < Config.spectrumControlPoints + 1; i++) {
            const value1: number = (i <= 0) ? 0 : settings.spectrum[i - 1];
            const value2: number = (i >= Config.spectrumControlPoints) ? settings.spectrum[Config.spectrumControlPoints - 1] : settings.spectrum[i];
            const octave1: number = controlPointToOctave(i - 1);
            let octave2: number = controlPointToOctave(i);
            if (i >= Config.spectrumControlPoints) octave2 = highestOctave + (octave2 - highestOctave) * falloffRatio;
            if (value1 == 0 && value2 == 0) continue;

            combinedAmplitude += 0.02 * drawNoiseSpectrum(wave, waveLength, octave1, octave2, value1 / Config.spectrumMax, value2 / Config.spectrumMax, -0.5);
        }
        if (settings.spectrum[Config.spectrumControlPoints - 1] > 0) {
            combinedAmplitude += 0.02 * drawNoiseSpectrum(wave, waveLength, highestOctave + (controlPointToOctave(Config.spectrumControlPoints) - highestOctave) * falloffRatio, highestOctave, settings.spectrum[Config.spectrumControlPoints - 1] / Config.spectrumMax, 0, -0.5);
        }

        inverseRealFourierTransform(wave, waveLength);
        scaleElementsByFactor(wave, 5.0 / (Math.sqrt(waveLength) * Math.pow(combinedAmplitude, 0.75)));

        // Duplicate the first sample at the end for easier wrap-around interpolation.
        wave[waveLength] = wave[0];

        return wave;
    }
}

export class HarmonicsWave {
    public harmonics: number[] = [];
    public hash: number = -1;

    constructor() {
        this.reset();
    }

    public reset(): void {
        for (let i: number = 0; i < Config.harmonicsControlPoints; i++) {
            this.harmonics[i] = 0;
        }
        this.harmonics[0] = Config.harmonicsMax;
        this.harmonics[3] = Config.harmonicsMax;
        this.harmonics[6] = Config.harmonicsMax;
        this.markCustomWaveDirty();
    }

    public markCustomWaveDirty(): void {
        const hashMult: number = Synth.fittingPowerOfTwo(Config.harmonicsMax + 2) - 1;
        let hash: number = 0;
        for (const point of this.harmonics) hash = ((hash * hashMult) + point) >>> 0;
        this.hash = hash;
    }
}

class HarmonicsWaveState {
    public wave: Float32Array | null = null;
    private _hash: number = -1;
    private _generatedForType: InstrumentType;

    public getCustomWave(settings: HarmonicsWave, instrumentType: InstrumentType): Float32Array {
        if (this._hash == settings.hash && this._generatedForType == instrumentType) return this.wave!;
        this._hash = settings.hash;
        this._generatedForType = instrumentType;

        const harmonicsRendered: number = (instrumentType == InstrumentType.pickedString) ? Config.harmonicsRenderedForPickedString : Config.harmonicsRendered;

        const waveLength: number = Config.harmonicsWavelength;
        const retroWave: Float32Array = getDrumWave(0, null, null);

        if (this.wave == null || this.wave.length != waveLength + 1) {
            this.wave = new Float32Array(waveLength + 1);
        }
        const wave: Float32Array = this.wave;

        for (let i: number = 0; i < waveLength; i++) {
            wave[i] = 0;
        }

        const overallSlope: number = -0.25;
        let combinedControlPointAmplitude: number = 1;

        for (let harmonicIndex: number = 0; harmonicIndex < harmonicsRendered; harmonicIndex++) {
            const harmonicFreq: number = harmonicIndex + 1;
            let controlValue: number = harmonicIndex < Config.harmonicsControlPoints ? settings.harmonics[harmonicIndex] : settings.harmonics[Config.harmonicsControlPoints - 1];
            if (harmonicIndex >= Config.harmonicsControlPoints) {
                controlValue *= 1 - (harmonicIndex - Config.harmonicsControlPoints) / (harmonicsRendered - Config.harmonicsControlPoints);
            }
            const normalizedValue: number = controlValue / Config.harmonicsMax;
            let amplitude: number = Math.pow(2, controlValue - Config.harmonicsMax + 1) * Math.sqrt(normalizedValue);
            if (harmonicIndex < Config.harmonicsControlPoints) {
                combinedControlPointAmplitude += amplitude;
            }
            amplitude *= Math.pow(harmonicFreq, overallSlope);

            // Multiply all the sine wave amplitudes by 1 or -1 based on the LFSR
            // retro wave (effectively random) to avoid egregiously tall spikes.
            amplitude *= retroWave[harmonicIndex + 589];

            wave[waveLength - harmonicFreq] = amplitude;
        }

        inverseRealFourierTransform(wave, waveLength);

        // Limit the maximum wave amplitude.
        const mult: number = 1 / Math.pow(combinedControlPointAmplitude, 0.7);
        for (let i: number = 0; i < wave.length; i++) wave[i] *= mult;

        performIntegralOld(wave);

        // The first sample should be zero, and we'll duplicate it at the end for easier interpolation.
        wave[waveLength] = wave[0];

        return wave;
    }
}

export class FilterControlPoint {
    public freq: number = 0;
    public gain: number = Config.filterGainCenter;
    public type: FilterType = FilterType.peak;

    public set(freqSetting: number, gainSetting: number): void {
        this.freq = freqSetting;
        this.gain = gainSetting;
    }

    public getHz(): number {
        return FilterControlPoint.getHzFromSettingValue(this.freq);
    }

    public static getHzFromSettingValue(value: number): number {
        return Config.filterFreqReferenceHz * Math.pow(2.0, (value - Config.filterFreqReferenceSetting) * Config.filterFreqStep);
    }
    public static getSettingValueFromHz(hz: number): number {
        return Math.log2(hz / Config.filterFreqReferenceHz) / Config.filterFreqStep + Config.filterFreqReferenceSetting;
    }
    public static getRoundedSettingValueFromHz(hz: number): number {
        return Math.max(0, Math.min(Config.filterFreqRange - 1, Math.round(FilterControlPoint.getSettingValueFromHz(hz))));
    }

    public getLinearGain(peakMult: number = 1.0): number {
        const power: number = (this.gain - Config.filterGainCenter) * Config.filterGainStep;
        const neutral: number = (this.type == FilterType.peak) ? 0.0 : -0.5;
        const interpolatedPower: number = neutral + (power - neutral) * peakMult;
        return Math.pow(2.0, interpolatedPower);
    }
    public static getRoundedSettingValueFromLinearGain(linearGain: number): number {
        return Math.max(0, Math.min(Config.filterGainRange - 1, Math.round(Math.log2(linearGain) / Config.filterGainStep + Config.filterGainCenter)));
    }

    public toCoefficients(filter: FilterCoefficients, sampleRate: number, freqMult: number = 1.0, peakMult: number = 1.0): void {
        const cornerRadiansPerSample: number = 2.0 * Math.PI * Math.max(Config.filterFreqMinHz, Math.min(Config.filterFreqMaxHz, freqMult * this.getHz())) / sampleRate;
        const linearGain: number = this.getLinearGain(peakMult);
        switch (this.type) {
            case FilterType.lowPass:
                filter.lowPass2ndOrderButterworth(cornerRadiansPerSample, linearGain);
                break;
            case FilterType.highPass:
                filter.highPass2ndOrderButterworth(cornerRadiansPerSample, linearGain);
                break;
            case FilterType.peak:
                filter.peak2ndOrder(cornerRadiansPerSample, linearGain, 1.0);
                break;
            default:
                throw new Error();
        }
    }

    public getVolumeCompensationMult(): number {
        const octave: number = (this.freq - Config.filterFreqReferenceSetting) * Config.filterFreqStep;
        const gainPow: number = (this.gain - Config.filterGainCenter) * Config.filterGainStep;
        switch (this.type) {
            case FilterType.lowPass:
                const freqRelativeTo8khz: number = Math.pow(2.0, octave) * Config.filterFreqReferenceHz / 8000.0;
                // Reverse the frequency warping from importing legacy simplified filters to imitate how the legacy filter cutoff setting affected volume.
                const warpedFreq: number = (Math.sqrt(1.0 + 4.0 * freqRelativeTo8khz) - 1.0) / 2.0;
                const warpedOctave: number = Math.log2(warpedFreq);
                return Math.pow(0.5, 0.2 * Math.max(0.0, gainPow + 1.0) + Math.min(0.0, Math.max(-3.0, 0.595 * warpedOctave + 0.35 * Math.min(0.0, gainPow + 1.0))));
            case FilterType.highPass:
                return Math.pow(0.5, 0.125 * Math.max(0.0, gainPow + 1.0) + Math.min(0.0, 0.3 * (-octave - Math.log2(Config.filterFreqReferenceHz / 125.0)) + 0.2 * Math.min(0.0, gainPow + 1.0)));
            case FilterType.peak:
                const distanceFromCenter: number = octave + Math.log2(Config.filterFreqReferenceHz / 2000.0);
                const freqLoudness: number = Math.pow(1.0 / (1.0 + Math.pow(distanceFromCenter / 3.0, 2.0)), 2.0);
                return Math.pow(0.5, 0.125 * Math.max(0.0, gainPow) + 0.1 * freqLoudness * Math.min(0.0, gainPow));
            default:
                throw new Error();
        }
    }
}

export class FilterSettings {
    public readonly controlPoints: FilterControlPoint[] = [];
    public controlPointCount: number = 0;

    constructor() {
        this.reset();
    }

    reset(): void {
        this.controlPointCount = 0;
    }

    addPoint(type: FilterType, freqSetting: number, gainSetting: number): void {
        let controlPoint: FilterControlPoint;
        if (this.controlPoints.length <= this.controlPointCount) {
            controlPoint = new FilterControlPoint();
            this.controlPoints[this.controlPointCount] = controlPoint;
        } else {
            controlPoint = this.controlPoints[this.controlPointCount];
        }
        this.controlPointCount++;
        controlPoint.type = type;
        controlPoint.set(freqSetting, gainSetting);
    }

    public toJsonObject(): Object {
        const filterArray: any[] = [];
        for (let i: number = 0; i < this.controlPointCount; i++) {
            const point: FilterControlPoint = this.controlPoints[i];
            filterArray.push({
                "type": Config.filterTypeNames[point.type],
                "cutoffHz": Math.round(point.getHz() * 100) / 100,
                "linearGain": Math.round(point.getLinearGain() * 10000) / 10000,
            });
        }
        return filterArray;
    }

    public fromJsonObject(filterObject: any): void {
        this.controlPoints.length = 0;
        if (filterObject) {
            for (const pointObject of filterObject) {
                const point: FilterControlPoint = new FilterControlPoint();
                point.type = Config.filterTypeNames.indexOf(pointObject["type"]);
                if (<any>point.type == -1) point.type = FilterType.peak;
                if (pointObject["cutoffHz"] != undefined) {
                    point.freq = FilterControlPoint.getRoundedSettingValueFromHz(pointObject["cutoffHz"]);
                } else {
                    point.freq = 0;
                }
                if (pointObject["linearGain"] != undefined) {
                    point.gain = FilterControlPoint.getRoundedSettingValueFromLinearGain(pointObject["linearGain"]);
                } else {
                    point.gain = Config.filterGainCenter;
                }
                this.controlPoints.push(point);
            }
        }
        this.controlPointCount = this.controlPoints.length;
    }

    // Returns true if all filter control points match in number and type (but not freq/gain)
    public static filtersCanMorph(filterA: FilterSettings, filterB: FilterSettings): boolean {
        if (filterA.controlPointCount != filterB.controlPointCount)
            return false;
        for (let i: number = 0; i < filterA.controlPointCount; i++) {
            if (filterA.controlPoints[i].type != filterB.controlPoints[i].type)
                return false;
        }
        return true;
    }

    // Interpolate two FilterSettings, where pos=0 is filterA and pos=1 is filterB
    public static lerpFilters(filterA: FilterSettings, filterB: FilterSettings, pos: number): FilterSettings {

        let lerpedFilter: FilterSettings = new FilterSettings();

        // One setting or another is null, return the other.
        if (filterA == null) {
            return filterA;
        }
        if (filterB == null) {
            return filterB;
        }

        pos = Math.max(0, Math.min(1, pos));

        // Filter control points match in number and type
        if (this.filtersCanMorph(filterA, filterB)) {
            for (let i: number = 0; i < filterA.controlPointCount; i++) {
                lerpedFilter.controlPoints[i] = new FilterControlPoint();
                lerpedFilter.controlPoints[i].type = filterA.controlPoints[i].type;
                lerpedFilter.controlPoints[i].freq = filterA.controlPoints[i].freq + (filterB.controlPoints[i].freq - filterA.controlPoints[i].freq) * pos;
                lerpedFilter.controlPoints[i].gain = filterA.controlPoints[i].gain + (filterB.controlPoints[i].gain - filterA.controlPoints[i].gain) * pos;
            }

            lerpedFilter.controlPointCount = filterA.controlPointCount;

            return lerpedFilter;
        }
        else {
            // Not allowing morph of unmatching filters for now. It's a hornet's nest of problems, and I had it implemented and mostly working and it didn't sound very interesting since the shape becomes "mushy" in between
            return (pos >= 1) ? filterB : filterA;
        }
        /* 
        // Filter control points do not match. Take all filterA points and move them to neutral at pos=1 (gain 7 for normal points, slide to edge and gain 7 for lo/hipass),
        // and do the opposite for filterB points. Return a filter with points for both.
        else {
            let lerpedFilter: FilterSettings = new FilterSettings();
            // Filter A's morph points
            for (let i: number = 0; i < filterA.controlPointCount; i++) {
                lerpedFilter.controlPoints[i] = new FilterControlPoint();
                lerpedFilter.controlPoints[i].type = filterA.controlPoints[i].type;
                lerpedFilter.controlPoints[i].gain = filterA.controlPoints[i].gain + (Config.filterGainCenter - filterA.controlPoints[i].gain) * pos;

                if (filterA.controlPoints[i].type == FilterType.peak) {
                    lerpedFilter.controlPoints[i].freq = filterA.controlPoints[i].freq;
                }
                else if (filterA.controlPoints[i].type == FilterType.highPass) {
                    lerpedFilter.controlPoints[i].freq = filterA.controlPoints[i].freq * (1 - pos);
                }
                else {
                    lerpedFilter.controlPoints[i].freq = filterA.controlPoints[i].freq + ((Config.filterFreqRange - 1) - filterA.controlPoints[i].freq) * pos;
                }
            }
            // Filter B's morph points
            for (let i: number = 0, j: number = filterA.controlPointCount; i < filterB.controlPointCount; i++, j++) {
                lerpedFilter.controlPoints[j] = new FilterControlPoint();
                lerpedFilter.controlPoints[j].type = filterB.controlPoints[i].type;
                lerpedFilter.controlPoints[j].gain = filterB.controlPoints[i].gain + (Config.filterGainCenter - filterB.controlPoints[i].gain) * (1 - pos);

                if (filterB.controlPoints[i].type == FilterType.peak) {
                    lerpedFilter.controlPoints[j].freq = filterB.controlPoints[i].freq;
                }
                else if (filterB.controlPoints[i].type == FilterType.highPass) {
                    lerpedFilter.controlPoints[j].freq = filterB.controlPoints[i].freq * pos;
                }
                else {
                    lerpedFilter.controlPoints[j].freq = filterB.controlPoints[i].freq + ((Config.filterFreqRange - 1) - filterB.controlPoints[i].freq) * (1 - pos);
                }
            }

            lerpedFilter.controlPointCount = filterA.controlPointCount + filterB.controlPointCount;

            return lerpedFilter;
        }
        */
    }

    public convertLegacySettings(legacyCutoffSetting: number, legacyResonanceSetting: number, legacyEnv: Envelope): void {
        this.reset();

        const legacyFilterCutoffMaxHz: number = 8000; // This was carefully calculated to correspond to no change in response when filtering at 48000 samples per second... when using the legacy simplified low-pass filter.
        const legacyFilterMax: number = 0.95;
        const legacyFilterMaxRadians: number = Math.asin(legacyFilterMax / 2.0) * 2.0;
        const legacyFilterMaxResonance: number = 0.95;
        const legacyFilterCutoffRange: number = 11;
        const legacyFilterResonanceRange: number = 8;

        const resonant: boolean = (legacyResonanceSetting > 1);
        const firstOrder: boolean = (legacyResonanceSetting == 0);
        const cutoffAtMax: boolean = (legacyCutoffSetting == legacyFilterCutoffRange - 1);
        const envDecays: boolean = (legacyEnv.type == EnvelopeType.flare || legacyEnv.type == EnvelopeType.twang || legacyEnv.type == EnvelopeType.decay || legacyEnv.type == EnvelopeType.noteSize);

        const standardSampleRate: number = 48000;
        const legacyHz: number = legacyFilterCutoffMaxHz * Math.pow(2.0, (legacyCutoffSetting - (legacyFilterCutoffRange - 1)) * 0.5);
        const legacyRadians: number = Math.min(legacyFilterMaxRadians, 2 * Math.PI * legacyHz / standardSampleRate);

        if (legacyEnv.type == EnvelopeType.none && !resonant && cutoffAtMax) {
            // The response is flat and there's no envelopes, so don't even bother adding any control points.
        } else if (firstOrder) {
            // In general, a 1st order lowpass can be approximated by a 2nd order lowpass
            // with a cutoff ~4 octaves higher (*16) and a gain of 1/16.
            // However, BeepBox's original lowpass filters behaved oddly as they
            // approach the nyquist frequency, so I've devised this curved conversion
            // to guess at a perceptually appropriate new cutoff frequency and gain.
            const extraOctaves: number = 3.5;
            const targetRadians: number = legacyRadians * Math.pow(2.0, extraOctaves);
            const curvedRadians: number = targetRadians / (1.0 + targetRadians / Math.PI);
            const curvedHz: number = standardSampleRate * curvedRadians / (2.0 * Math.PI)
            const freqSetting: number = FilterControlPoint.getRoundedSettingValueFromHz(curvedHz);
            const finalHz: number = FilterControlPoint.getHzFromSettingValue(freqSetting);
            const finalRadians: number = 2.0 * Math.PI * finalHz / standardSampleRate;

            const legacyFilter: FilterCoefficients = new FilterCoefficients();
            legacyFilter.lowPass1stOrderSimplified(legacyRadians);
            const response: FrequencyResponse = new FrequencyResponse();
            response.analyze(legacyFilter, finalRadians);
            const legacyFilterGainAtNewRadians: number = response.magnitude();

            let logGain: number = Math.log2(legacyFilterGainAtNewRadians);
            // Bias slightly toward 2^(-extraOctaves):
            logGain = -extraOctaves + (logGain + extraOctaves) * 0.82;
            // Decaying envelopes move the cutoff frequency back into an area where the best approximation of the first order slope requires a lower gain setting.
            if (envDecays) logGain = Math.min(logGain, -1.0);
            const convertedGain: number = Math.pow(2.0, logGain);
            const gainSetting: number = FilterControlPoint.getRoundedSettingValueFromLinearGain(convertedGain);

            this.addPoint(FilterType.lowPass, freqSetting, gainSetting);
        } else {
            const intendedGain: number = 0.5 / (1.0 - legacyFilterMaxResonance * Math.sqrt(Math.max(0.0, legacyResonanceSetting - 1.0) / (legacyFilterResonanceRange - 2.0)));
            const invertedGain: number = 0.5 / intendedGain;
            const maxRadians: number = 2.0 * Math.PI * legacyFilterCutoffMaxHz / standardSampleRate;
            const freqRatio: number = legacyRadians / maxRadians;
            const targetRadians: number = legacyRadians * (freqRatio * Math.pow(invertedGain, 0.9) + 1.0);
            const curvedRadians: number = legacyRadians + (targetRadians - legacyRadians) * invertedGain;
            let curvedHz: number;
            if (envDecays) {
                curvedHz = standardSampleRate * Math.min(curvedRadians, legacyRadians * Math.pow(2, 0.25)) / (2.0 * Math.PI);
            } else {
                curvedHz = standardSampleRate * curvedRadians / (2.0 * Math.PI);
            }
            const freqSetting: number = FilterControlPoint.getRoundedSettingValueFromHz(curvedHz);

            let legacyFilterGain: number;
            if (envDecays) {
                legacyFilterGain = intendedGain;
            } else {
                const legacyFilter: FilterCoefficients = new FilterCoefficients();
                legacyFilter.lowPass2ndOrderSimplified(legacyRadians, intendedGain);
                const response: FrequencyResponse = new FrequencyResponse();
                response.analyze(legacyFilter, curvedRadians);
                legacyFilterGain = response.magnitude();
            }
            if (!resonant) legacyFilterGain = Math.min(legacyFilterGain, Math.sqrt(0.5));
            const gainSetting: number = FilterControlPoint.getRoundedSettingValueFromLinearGain(legacyFilterGain);

            this.addPoint(FilterType.lowPass, freqSetting, gainSetting);
        }

        // Added for JummBox - making a 0 point filter does not truncate control points!
        this.controlPoints.length = this.controlPointCount;
    }

    // Similar to above, but purpose-fit for quick conversions in synth calls.
    public convertLegacySettingsForSynth(legacyCutoffSetting: number, legacyResonanceSetting: number, allowFirstOrder: boolean = false): void {
        this.reset();

        const legacyFilterCutoffMaxHz: number = 8000; // This was carefully calculated to correspond to no change in response when filtering at 48000 samples per second... when using the legacy simplified low-pass filter.
        const legacyFilterMax: number = 0.95;
        const legacyFilterMaxRadians: number = Math.asin(legacyFilterMax / 2.0) * 2.0;
        const legacyFilterMaxResonance: number = 0.95;
        const legacyFilterCutoffRange: number = 11;
        const legacyFilterResonanceRange: number = 8;

        const firstOrder: boolean = (legacyResonanceSetting == 0 && allowFirstOrder);
        const standardSampleRate: number = 48000;
        const legacyHz: number = legacyFilterCutoffMaxHz * Math.pow(2.0, (legacyCutoffSetting - (legacyFilterCutoffRange - 1)) * 0.5);
        const legacyRadians: number = Math.min(legacyFilterMaxRadians, 2 * Math.PI * legacyHz / standardSampleRate);

        if (firstOrder) {
            // In general, a 1st order lowpass can be approximated by a 2nd order lowpass
            // with a cutoff ~4 octaves higher (*16) and a gain of 1/16.
            // However, BeepBox's original lowpass filters behaved oddly as they
            // approach the nyquist frequency, so I've devised this curved conversion
            // to guess at a perceptually appropriate new cutoff frequency and gain.
            const extraOctaves: number = 3.5;
            const targetRadians: number = legacyRadians * Math.pow(2.0, extraOctaves);
            const curvedRadians: number = targetRadians / (1.0 + targetRadians / Math.PI);
            const curvedHz: number = standardSampleRate * curvedRadians / (2.0 * Math.PI)
            const freqSetting: number = FilterControlPoint.getRoundedSettingValueFromHz(curvedHz);
            const finalHz: number = FilterControlPoint.getHzFromSettingValue(freqSetting);
            const finalRadians: number = 2.0 * Math.PI * finalHz / standardSampleRate;

            const legacyFilter: FilterCoefficients = new FilterCoefficients();
            legacyFilter.lowPass1stOrderSimplified(legacyRadians);
            const response: FrequencyResponse = new FrequencyResponse();
            response.analyze(legacyFilter, finalRadians);
            const legacyFilterGainAtNewRadians: number = response.magnitude();

            let logGain: number = Math.log2(legacyFilterGainAtNewRadians);
            // Bias slightly toward 2^(-extraOctaves):
            logGain = -extraOctaves + (logGain + extraOctaves) * 0.82;
            const convertedGain: number = Math.pow(2.0, logGain);
            const gainSetting: number = FilterControlPoint.getRoundedSettingValueFromLinearGain(convertedGain);

            this.addPoint(FilterType.lowPass, freqSetting, gainSetting);
        } else {
            const intendedGain: number = 0.5 / (1.0 - legacyFilterMaxResonance * Math.sqrt(Math.max(0.0, legacyResonanceSetting - 1.0) / (legacyFilterResonanceRange - 2.0)));
            const invertedGain: number = 0.5 / intendedGain;
            const maxRadians: number = 2.0 * Math.PI * legacyFilterCutoffMaxHz / standardSampleRate;
            const freqRatio: number = legacyRadians / maxRadians;
            const targetRadians: number = legacyRadians * (freqRatio * Math.pow(invertedGain, 0.9) + 1.0);
            const curvedRadians: number = legacyRadians + (targetRadians - legacyRadians) * invertedGain;
            let curvedHz: number;

            curvedHz = standardSampleRate * curvedRadians / (2.0 * Math.PI);
            const freqSetting: number = FilterControlPoint.getSettingValueFromHz(curvedHz);

            let legacyFilterGain: number;

            const legacyFilter: FilterCoefficients = new FilterCoefficients();
            legacyFilter.lowPass2ndOrderSimplified(legacyRadians, intendedGain);
            const response: FrequencyResponse = new FrequencyResponse();
            response.analyze(legacyFilter, curvedRadians);
            legacyFilterGain = response.magnitude();
            const gainSetting: number = FilterControlPoint.getRoundedSettingValueFromLinearGain(legacyFilterGain);

            this.addPoint(FilterType.lowPass, freqSetting, gainSetting);
        }

    }
}

export class EnvelopeSettings {
    public target: number = 0;
    public index: number = 0;
    public envelope: number = 0;
    //slarmoo's box 1.0
    public pitchEnvelopeStart: number;
    public pitchEnvelopeEnd: number;
    public inverse: boolean;
    //midbox
    public perEnvelopeSpeed: number = Config.newEnvelopes[this.envelope].speed;
    public perEnvelopeLowerBound: number = 0;
    public perEnvelopeUpperBound: number = 1;
    //modulation support
    public tempEnvelopeSpeed: number | null = null;
    public tempEnvelopeLowerBound: number | null = null;
    public tempEnvelopeUpperBound: number | null = null;
    public tempPitchStart: number | null = null;
    public tempPitchEnd: number | null = null;
    //pseudo random
    public steps: number = 2;
    public seed: number = 2;
    //lfo and random types
    public waveform: number = LFOEnvelopeTypes.sine;
    //moved discrete into here
    public discrete: boolean = false;

    constructor(public isNoiseEnvelope: boolean = false) {
        this.reset();
    }

    reset(): void {
        this.target = 0;
        this.index = 0;
        this.envelope = 0;
        this.pitchEnvelopeStart = 0;
        this.pitchEnvelopeEnd = this.isNoiseEnvelope ? Config.drumCount - 1 : Config.maxPitch;
        this.inverse = false;
        this.perEnvelopeSpeed = Config.newEnvelopes[this.envelope].speed;
        this.perEnvelopeLowerBound = 0;
        this.perEnvelopeUpperBound = 1;
        this.tempEnvelopeSpeed = null;
        this.tempEnvelopeLowerBound = null;
        this.tempEnvelopeUpperBound = null;
        this.steps = 2;
        this.seed = 2;
        this.waveform = LFOEnvelopeTypes.sine;
        this.discrete = false;
    }

    public toJsonObject(): Object {
        const envelopeObject: any = {
            "target": Config.instrumentAutomationTargets[this.target].name,
            "envelope": Config.newEnvelopes[this.envelope].name,
            "inverse": this.inverse,
            "perEnvelopeSpeed": this.perEnvelopeSpeed,
            "perEnvelopeLowerBound": this.perEnvelopeLowerBound,
            "perEnvelopeUpperBound": this.perEnvelopeUpperBound,
            "discrete": this.discrete,
        };
        if (Config.instrumentAutomationTargets[this.target].maxCount > 1) {
            envelopeObject["index"] = this.index;
        }
        if (Config.newEnvelopes[this.envelope].name == "pitch") {
            envelopeObject["pitchEnvelopeStart"] = this.pitchEnvelopeStart;
            envelopeObject["pitchEnvelopeEnd"] = this.pitchEnvelopeEnd;
        } else if (Config.newEnvelopes[this.envelope].name == "random") {
            envelopeObject["steps"] = this.steps;
            envelopeObject["seed"] = this.seed;
            envelopeObject["waveform"] = this.waveform;
        } else if (Config.newEnvelopes[this.envelope].name == "lfo") {
            envelopeObject["waveform"] = this.waveform;
            envelopeObject["steps"] = this.steps;
        }
        return envelopeObject;
    }

    public fromJsonObject(envelopeObject: any, format: string = "slarmoosbox"): void {
        this.reset();

        let target: AutomationTarget = Config.instrumentAutomationTargets.dictionary[envelopeObject["target"]];
        if (target == null) target = Config.instrumentAutomationTargets.dictionary["noteVolume"];
        this.target = target.index;

        let envelope: Envelope = Config.envelopes.dictionary["none"];
        let isTremolo2: Boolean = false;
        if (format == "slarmoosbox") {
            if (envelopeObject["envelope"] == "tremolo2") {
                envelope = Config.newEnvelopes[EnvelopeType.lfo];
                isTremolo2 = true;
            } else if (envelopeObject["envelope"] == "tremolo") {
                envelope = Config.newEnvelopes[EnvelopeType.lfo];
                isTremolo2 = false;
            } else {
                envelope = Config.newEnvelopes.dictionary[envelopeObject["envelope"]];
            }
        } else {
            if (Config.envelopes.dictionary[envelopeObject["envelope"]].type == EnvelopeType.tremolo2) {
                envelope = Config.newEnvelopes[EnvelopeType.lfo];
                isTremolo2 = true;
            } else if (Config.newEnvelopes[Math.max(Config.envelopes.dictionary[envelopeObject["envelope"]].type - 1, 0)].index > EnvelopeType.lfo) {
                envelope = Config.newEnvelopes[Config.envelopes.dictionary[envelopeObject["envelope"]].type - 1];
            } else {
                envelope = Config.newEnvelopes[Config.envelopes.dictionary[envelopeObject["envelope"]].type];
            }
        }

        if (envelope == undefined) {
            if (Config.envelopes.dictionary[envelopeObject["envelope"]].type == EnvelopeType.tremolo2) {
                envelope = Config.newEnvelopes[EnvelopeType.lfo];
                isTremolo2 = true;
            } else if (Config.newEnvelopes[Math.max(Config.envelopes.dictionary[envelopeObject["envelope"]].type - 1, 0)].index > EnvelopeType.lfo) {
                envelope = Config.newEnvelopes[Config.envelopes.dictionary[envelopeObject["envelope"]].type - 1];
            } else {
                envelope = Config.newEnvelopes[Config.envelopes.dictionary[envelopeObject["envelope"]].type];
            }
        }
        if (envelope == null) envelope = Config.envelopes.dictionary["none"];
        this.envelope = envelope.index;

        if (envelopeObject["index"] != undefined) {
            this.index = clamp(0, Config.instrumentAutomationTargets[this.target].maxCount, envelopeObject["index"] | 0);
        } else {
            this.index = 0;
        }

        if (envelopeObject["pitchEnvelopeStart"] != undefined) {
            this.pitchEnvelopeStart = clamp(0, this.isNoiseEnvelope ? Config.drumCount : Config.maxPitch + 1, envelopeObject["pitchEnvelopeStart"]);
        } else {
            this.pitchEnvelopeStart = 0;
        }

        if (envelopeObject["pitchEnvelopeEnd"] != undefined) {
            this.pitchEnvelopeEnd = clamp(0, this.isNoiseEnvelope ? Config.drumCount : Config.maxPitch + 1, envelopeObject["pitchEnvelopeEnd"]);
        } else {
            this.pitchEnvelopeEnd = this.isNoiseEnvelope ? Config.drumCount : Config.maxPitch;
        }

        this.inverse = Boolean(envelopeObject["inverse"]);

        if (envelopeObject["perEnvelopeSpeed"] != undefined) {
            this.perEnvelopeSpeed = envelopeObject["perEnvelopeSpeed"];
        } else {
            this.perEnvelopeSpeed = Config.newEnvelopes[this.envelope].speed;
        }

        if (envelopeObject["perEnvelopeLowerBound"] != undefined) {
            this.perEnvelopeLowerBound = clamp(Config.perEnvelopeBoundMin, Config.perEnvelopeBoundMax + 1, envelopeObject["perEnvelopeLowerBound"]);
        } else {
            this.perEnvelopeLowerBound = 0;
        }

        if (envelopeObject["perEnvelopeUpperBound"] != undefined) {
            this.perEnvelopeUpperBound = clamp(Config.perEnvelopeBoundMin, Config.perEnvelopeBoundMax + 1, envelopeObject["perEnvelopeUpperBound"]);
        } else {
            this.perEnvelopeUpperBound = 1;
        }

        if (this.perEnvelopeLowerBound > this.perEnvelopeUpperBound) {
            [this.perEnvelopeLowerBound, this.perEnvelopeUpperBound] = [this.perEnvelopeUpperBound, this.perEnvelopeLowerBound];
            this.inverse = !this.inverse;
        }

        //convert tremolo2 settings into lfo
        if (isTremolo2) {
            if (this.inverse) {
                this.perEnvelopeUpperBound = Math.floor((this.perEnvelopeUpperBound / 2) * 10) / 10;
                this.perEnvelopeLowerBound = Math.floor((this.perEnvelopeLowerBound / 2) * 10) / 10;
            } else {
                this.perEnvelopeUpperBound = Math.floor((0.5 + (this.perEnvelopeUpperBound - this.perEnvelopeLowerBound) / 2) * 10) / 10;
                this.perEnvelopeLowerBound = 0.5;
            }
        }

        if (envelopeObject["steps"] != undefined) {
            this.steps = clamp(1, Config.randomEnvelopeStepsMax + 1, envelopeObject["steps"]);
        } else {
            this.steps = 2;
        }

        if (envelopeObject["seed"] != undefined) {
            this.seed = clamp(1, Config.randomEnvelopeSeedMax + 1, envelopeObject["seed"]);
        } else {
            this.seed = 2;
        }

        if (envelopeObject["waveform"] != undefined) {
            this.waveform = envelopeObject["waveform"];
        } else {
            this.waveform = LFOEnvelopeTypes.sine;
        }

        if (envelopeObject["discrete"] != undefined) {
            this.discrete = envelopeObject["discrete"];
        } else {
            this.discrete = false;
        }
    }
}





// Settings that were available to old versions of BeepBox but are no longer available in the
// current version that need to be reinterpreted as a group to determine the best way to
// represent them in the current version.
interface LegacySettings {
    filterCutoff?: number;
    filterResonance?: number;
    filterEnvelope?: Envelope;
    pulseEnvelope?: Envelope;
    operatorEnvelopes?: Envelope[];
    feedbackEnvelope?: Envelope;
}

export class Instrument {
    public get isNoiseInstrument(): boolean { return this.type == InstrumentType.noise || this.type == InstrumentType.drumset; }
    public type: InstrumentType = InstrumentType.chip;
    public preset: number = 0;
    public chipWave: number = 2;
    public chipNoise: number = 1;
    public eqFilter: FilterSettings = new FilterSettings();
    public eqFilterType: boolean = false;
    public eqFilterSimpleCut: number = Config.filterSimpleCutRange - 1;
    public eqFilterSimplePeak: number = 0;
    public noteFilter: FilterSettings = new FilterSettings();
    public noteFilterType: boolean = false;
    public noteFilterSimpleCut: number = Config.filterSimpleCutRange - 1;
    public noteFilterSimplePeak: number = 0;
    public eqSubFilters: (FilterSettings | null)[] = [];
    public noteSubFilters: (FilterSettings | null)[] = [];
    public tmpEqFilterStart: FilterSettings | null;
    public tmpEqFilterEnd: FilterSettings | null;
    public tmpNoteFilterStart: FilterSettings | null;
    public tmpNoteFilterEnd: FilterSettings | null;
    public envelopes: EnvelopeSettings[] = [];
    public fadeIn: number = 0;
    public fadeOut: number = Config.fadeOutNeutral;
    public envelopeCount: number = 0;
    public transition: number = Config.transitions.dictionary["normal"].index;
    public pitchShift: number = 0;
    public detune: number = 0;
    public vibrato: number = 0;
    public interval: number = 0;
    public vibratoDepth: number = 0;
    public vibratoSpeed: number = 10;
    public vibratoDelay: number = 0;
    public vibratoType: number = 0;
    public unison: number = 0;
    public effects: number = 0;
    public chord: number = 1;
    public volume: number = 0;
    public octaveOffset: number = 0;
    public pan: number = Config.panCenter;
    public panDelay: number = 10;
    public arpeggioSpeed: number = 12;
    public fastTwoNoteArp: boolean = false;
    public legacyTieOver: boolean = false;
    public clicklessTransition: boolean = false;
    public aliases: boolean = false;
    public pulseWidth: number = Config.pulseWidthRange;
    public stringSustain: number = 10;
    public distortion: number = 0;
    public bitcrusherFreq: number = 0;
    public bitcrusherQuantization: number = 0;
    public chorus: number = 0;
    public reverb: number = 0;
    public echoSustain: number = 0;
    public echoDelay: number = 0;
    public algorithm: number = 0;
    public feedbackType: number = 0;
    public algorithm6Op: number = 1;
    public feedbackType6Op: number = 1;//default to not custom
    public customAlgorithm: CustomAlgorithm = new CustomAlgorithm(); //{ name: "1←4(2←5 3←6", carrierCount: 3, associatedCarrier: [1, 2, 3, 1, 2, 3], modulatedBy: [[2, 3, 4], [5], [6], [], [], []] };
    public customFeedbackType: CustomFeedBack = new CustomFeedBack(); //{ name: "1↔4 2↔5 3↔6", indices: [[3], [5], [6], [1], [2], [3]] };
    public feedbackAmplitude: number = 0;
    public LFOtime: number = 0;
    public nextLFOtime: number = 0;
    public arpTime: number = 0;
    public customChipWave: Float32Array = new Float32Array(64);
    public customChipWaveIntegral: Float32Array = new Float32Array(65); // One extra element for wrap-around in chipSynth.
    public readonly operators: Operator[] = [];
    public readonly spectrumWave: SpectrumWave;
    public readonly harmonicsWave: HarmonicsWave = new HarmonicsWave();
    public readonly drumsetEnvelopes: number[] = [];
    public readonly drumsetSpectrumWaves: SpectrumWave[] = [];
    public modChannels: number[] = [];
    public modInstruments: number[] = [];
    public modulators: number[] = [];
    public modFilterTypes: number[] = [];
    public invalidModulators: boolean[] = [];
    constructor(isNoiseChannel: boolean, isModChannel: boolean) {

        if (isModChannel) {
            for (let mod: number = 0; mod < Config.modCount; mod++) {
                this.modChannels.push(0);
                this.modInstruments.push(0);
                this.modulators.push(Config.modulators.dictionary["none"].index);
            }
        }

        this.spectrumWave = new SpectrumWave(isNoiseChannel);
        for (let i: number = 0; i < Config.operatorCount+2; i++) {//hopefully won't break everything
            this.operators[i] = new Operator(i);
        }
        for (let i: number = 0; i < Config.drumCount; i++) {
            this.drumsetEnvelopes[i] = Config.envelopes.dictionary["twang 2"].index;
            this.drumsetSpectrumWaves[i] = new SpectrumWave(true);
        }

        for (let i = 0; i < 64; i++) {
            this.customChipWave[i] = 24 - Math.floor(i * (48 / 64));
        }

        let sum: number = 0.0;
        for (let i: number = 0; i < this.customChipWave.length; i++) {
            sum += this.customChipWave[i];
        }
        const average: number = sum / this.customChipWave.length;

        // Perform the integral on the wave. The chipSynth will perform the derivative to get the original wave back but with antialiasing.
        let cumulative: number = 0;
        let wavePrev: number = 0;
        for (let i: number = 0; i < this.customChipWave.length; i++) {
            cumulative += wavePrev;
            wavePrev = this.customChipWave[i] - average;
            this.customChipWaveIntegral[i] = cumulative;
        }

        // 65th, last sample is for anti-aliasing
        this.customChipWaveIntegral[64] = 0.0;

    }

    public setTypeAndReset(type: InstrumentType, isNoiseChannel: boolean, isModChannel: boolean): void {
        // Mod channels are forced to one type.
        if (isModChannel) type = InstrumentType.mod;
        this.type = type;
        this.preset = type;
        this.volume = 0;
        this.effects = (1 << EffectType.panning); // Panning enabled by default in JB.
        this.chorus = Config.chorusRange - 1;
        this.reverb = 0;
        this.echoSustain = Math.floor((Config.echoSustainRange - 1) * 0.5);
        this.echoDelay = Math.floor((Config.echoDelayRange - 1) * 0.5);
        this.eqFilter.reset();
        this.eqFilterType = false;
        this.eqFilterSimpleCut = Config.filterSimpleCutRange - 1;
        this.eqFilterSimplePeak = 0;
        for (let i: number = 0; i < Config.filterMorphCount; i++) {
            this.eqSubFilters[i] = null;
            this.noteSubFilters[i] = null;
        }
        this.noteFilter.reset();
        this.noteFilterType = false;
        this.noteFilterSimpleCut = Config.filterSimpleCutRange - 1;
        this.noteFilterSimplePeak = 0;
        this.distortion = Math.floor((Config.distortionRange - 1) * 0.75);
        this.bitcrusherFreq = Math.floor((Config.bitcrusherFreqRange - 1) * 0.5)
        this.bitcrusherQuantization = Math.floor((Config.bitcrusherQuantizationRange - 1) * 0.5);
        this.octaveOffset = 0;
        this.pan = Config.panCenter;
        this.panDelay = 10;
        this.pitchShift = Config.pitchShiftCenter;
        this.detune = Config.detuneCenter;
        this.vibrato = 0;
        this.unison = 0;
        this.stringSustain = 10;
        this.clicklessTransition = false;
        this.arpeggioSpeed = 12;
        this.legacyTieOver = false;
        this.aliases = false;
        this.fadeIn = 0;
        this.fadeOut = Config.fadeOutNeutral;
        this.transition = Config.transitions.dictionary["normal"].index;
        this.envelopeCount = 0;
        switch (type) {
            case InstrumentType.chip:
                this.chipWave = 2;
                // TODO: enable the chord effect?
                this.chord = Config.chords.dictionary["arpeggio"].index;
                break;
            case InstrumentType.customChipWave:
                this.chipWave = 2;
                this.chord = Config.chords.dictionary["arpeggio"].index;
                for (let i: number = 0; i < 64; i++) {
                    this.customChipWave[i] = 24 - (Math.floor(i * (48 / 64)));
                }

                let sum: number = 0.0;
                for (let i: number = 0; i < this.customChipWave.length; i++) {
                    sum += this.customChipWave[i];
                }
                const average: number = sum / this.customChipWave.length;

                // Perform the integral on the wave. The chipSynth will perform the derivative to get the original wave back but with antialiasing.
                let cumulative: number = 0;
                let wavePrev: number = 0;
                for (let i: number = 0; i < this.customChipWave.length; i++) {
                    cumulative += wavePrev;
                    wavePrev = this.customChipWave[i] - average;
                    this.customChipWaveIntegral[i] = cumulative;
                }

                this.customChipWaveIntegral[64] = 0.0;
                break;
            case InstrumentType.fm:
                this.chord = Config.chords.dictionary["custom interval"].index;
                this.algorithm = 0;
                this.feedbackType = 0;
                this.feedbackAmplitude = 0;
                for (let i: number = 0; i < this.operators.length; i++) {
                    this.operators[i].reset(i);
                }
                break;
            case InstrumentType.fm6op:
                this.transition = 1;
                this.vibrato = 0;
                this.effects = 1;
                this.chord = 3;
                this.algorithm = 0;
                this.feedbackType = 0;
                this.algorithm6Op = 1;
                this.feedbackType6Op = 1;
                this.customAlgorithm.fromPreset(1);
                this.feedbackAmplitude = 0;
                for (let i: number = 0; i < this.operators.length; i++) {
                    this.operators[i].reset(i);
                }
                break;
            case InstrumentType.noise:
                this.chipNoise = 1;
                this.chord = Config.chords.dictionary["arpeggio"].index;
                break;
            case InstrumentType.spectrum:
                this.chord = Config.chords.dictionary["simultaneous"].index;
                this.spectrumWave.reset(isNoiseChannel);
                break;
            case InstrumentType.drumset:
                this.chord = Config.chords.dictionary["simultaneous"].index;
                for (let i: number = 0; i < Config.drumCount; i++) {
                    this.drumsetEnvelopes[i] = Config.envelopes.dictionary["twang 2"].index;
                    if (this.drumsetSpectrumWaves[i] == undefined) {
                        this.drumsetSpectrumWaves[i] = new SpectrumWave(true);
                    }
                    this.drumsetSpectrumWaves[i].reset(isNoiseChannel);
                }
                break;
            case InstrumentType.harmonics:
                this.chord = Config.chords.dictionary["simultaneous"].index;
                this.harmonicsWave.reset();
                break;
            case InstrumentType.pwm:
                this.chord = Config.chords.dictionary["arpeggio"].index;
                this.pulseWidth = Config.pulseWidthRange;
                break;
            case InstrumentType.pickedString:
                this.chord = Config.chords.dictionary["strum"].index;
                this.harmonicsWave.reset();
                break;
            case InstrumentType.mod:
                this.transition = 0;
                this.vibrato = 0;
                this.interval = 0;
                this.effects = 0;
                this.chord = 0;
                this.modChannels = [];
                this.modInstruments = [];
                this.modulators = [];
                for (let mod: number = 0; mod < Config.modCount; mod++) {
                    this.modChannels.push(-2);
                    this.modInstruments.push(0);
                    this.modulators.push(Config.modulators.dictionary["none"].index);
                    this.invalidModulators[mod] = false;
                    this.modFilterTypes[mod] = 0;
                }
                break;
            default:
                throw new Error("Unrecognized instrument type: " + type);
        }
        // Chip/noise instruments had arpeggio and FM had custom interval but neither
        // explicitly saved the chorus setting beforeSeven so enable it here. The effects
        // will otherwise get overridden when reading SongTagCode.startInstrument.
        if (this.chord != Config.chords.dictionary["simultaneous"].index) {
            // Enable chord if it was used.
            this.effects = (this.effects | (1 << EffectType.chord));
        }
    }

    // (only) difference for JummBox: Returns whether or not the note filter was chosen for filter conversion.
    public convertLegacySettings(legacySettings: LegacySettings, forceSimpleFilter: boolean): void {
        let legacyCutoffSetting: number | undefined = legacySettings.filterCutoff;
        let legacyResonanceSetting: number | undefined = legacySettings.filterResonance;
        let legacyFilterEnv: Envelope | undefined = legacySettings.filterEnvelope;
        let legacyPulseEnv: Envelope | undefined = legacySettings.pulseEnvelope;
        let legacyOperatorEnvelopes: Envelope[] | undefined = legacySettings.operatorEnvelopes;
        let legacyFeedbackEnv: Envelope | undefined = legacySettings.feedbackEnvelope;

        // legacy defaults:
        if (legacyCutoffSetting == undefined) legacyCutoffSetting = (this.type == InstrumentType.chip) ? 6 : 10;
        if (legacyResonanceSetting == undefined) legacyResonanceSetting = 0;
        if (legacyFilterEnv == undefined) legacyFilterEnv = Config.envelopes.dictionary["none"];
        if (legacyPulseEnv == undefined) legacyPulseEnv = Config.envelopes.dictionary[(this.type == InstrumentType.pwm) ? "twang 2" : "none"];
        if (legacyOperatorEnvelopes == undefined) legacyOperatorEnvelopes = [Config.envelopes.dictionary[(this.type == InstrumentType.fm) ? "note size" : "none"], Config.envelopes.dictionary["none"], Config.envelopes.dictionary["none"], Config.envelopes.dictionary["none"]];
        if (legacyFeedbackEnv == undefined) legacyFeedbackEnv = Config.envelopes.dictionary["none"];

        // The "punch" envelope is special: it goes *above* the chosen cutoff. But if the cutoff was already at the max, it couldn't go any higher... except in the current version of BeepBox I raised the max cutoff so it *can* but then it sounds different, so to preserve the original sound let's just remove the punch envelope.
        const legacyFilterCutoffRange: number = 11;
        const cutoffAtMax: boolean = (legacyCutoffSetting == legacyFilterCutoffRange - 1);
        if (cutoffAtMax && legacyFilterEnv.type == EnvelopeType.punch) legacyFilterEnv = Config.envelopes.dictionary["none"];

        const carrierCount: number = Config.algorithms[this.algorithm].carrierCount;
        let noCarriersControlledByNoteSize: boolean = true;
        let allCarriersControlledByNoteSize: boolean = true;
        let noteSizeControlsSomethingElse: boolean = (legacyFilterEnv.type == EnvelopeType.noteSize) || (legacyPulseEnv.type == EnvelopeType.noteSize);
        if (this.type == InstrumentType.fm) {
            noteSizeControlsSomethingElse = noteSizeControlsSomethingElse || (legacyFeedbackEnv.type == EnvelopeType.noteSize);
            for (let i: number = 0; i < legacyOperatorEnvelopes.length; i++) {
                if (i < carrierCount) {
                    if (legacyOperatorEnvelopes[i].type != EnvelopeType.noteSize) {
                        allCarriersControlledByNoteSize = false;
                    } else {
                        noCarriersControlledByNoteSize = false;
                    }
                } else {
                    noteSizeControlsSomethingElse = noteSizeControlsSomethingElse || (legacyOperatorEnvelopes[i].type == EnvelopeType.noteSize);
                }
            }
        }

        this.envelopeCount = 0;

        if (this.type == InstrumentType.fm) {
            if (allCarriersControlledByNoteSize && noteSizeControlsSomethingElse) {
                this.addEnvelope(Config.instrumentAutomationTargets.dictionary["noteVolume"].index, 0, Config.envelopes.dictionary["note size"].index);
            } else if (noCarriersControlledByNoteSize && !noteSizeControlsSomethingElse) {
                this.addEnvelope(Config.instrumentAutomationTargets.dictionary["none"].index, 0, Config.envelopes.dictionary["note size"].index);
            }
        }

        if (legacyFilterEnv.type == EnvelopeType.none) {
            this.noteFilter.reset();
            this.noteFilterType = false;
            this.eqFilter.convertLegacySettings(legacyCutoffSetting, legacyResonanceSetting, legacyFilterEnv);
            this.effects &= ~(1 << EffectType.noteFilter);
            if (forceSimpleFilter || this.eqFilterType) {
                this.eqFilterType = true;
                this.eqFilterSimpleCut = legacyCutoffSetting;
                this.eqFilterSimplePeak = legacyResonanceSetting;
            }
        } else {
            this.eqFilter.reset();

            this.eqFilterType = false;
            this.noteFilterType = false;
            this.noteFilter.convertLegacySettings(legacyCutoffSetting, legacyResonanceSetting, legacyFilterEnv);
            this.effects |= 1 << EffectType.noteFilter;
            this.addEnvelope(Config.instrumentAutomationTargets.dictionary["noteFilterAllFreqs"].index, 0, legacyFilterEnv.index);
            if (forceSimpleFilter || this.noteFilterType) {
                this.noteFilterType = true;
                this.noteFilterSimpleCut = legacyCutoffSetting;
                this.noteFilterSimplePeak = legacyResonanceSetting;
            }
        }

        if (legacyPulseEnv.type != EnvelopeType.none) {
            this.addEnvelope(Config.instrumentAutomationTargets.dictionary["pulseWidth"].index, 0, legacyPulseEnv.index);
        }

        for (let i: number = 0; i < legacyOperatorEnvelopes.length; i++) {
            if (i < carrierCount && allCarriersControlledByNoteSize) continue;
            if (legacyOperatorEnvelopes[i].type != EnvelopeType.none) {
                this.addEnvelope(Config.instrumentAutomationTargets.dictionary["operatorAmplitude"].index, i, legacyOperatorEnvelopes[i].index);
            }
        }

        if (legacyFeedbackEnv.type != EnvelopeType.none) {
            this.addEnvelope(Config.instrumentAutomationTargets.dictionary["feedbackAmplitude"].index, 0, legacyFeedbackEnv.index);
        }
    }

    public toJsonObject(): Object {
        const instrumentObject: any = {
            "type": Config.instrumentTypeNames[this.type],
            "volume": this.volume,
            "octaveOffset": this.octaveOffset,
            "eqFilter": this.eqFilter.toJsonObject(),
            "eqFilterType": this.eqFilterType,
            "eqSimpleCut": this.eqFilterSimpleCut,
            "eqSimplePeak": this.eqFilterSimplePeak
        };

        if (this.preset != this.type) {
            instrumentObject["preset"] = this.preset;
        }

        for (let i: number = 0; i < Config.filterMorphCount; i++) {
            if (this.eqSubFilters[i] != null)
                instrumentObject["eqSubFilters" + i] = this.eqSubFilters[i]!.toJsonObject();
        }

        const effects: string[] = [];
        for (const effect of Config.effectOrder) {
            if (this.effects & (1 << effect)) {
                effects.push(Config.effectNames[effect]);
            }
        }
        instrumentObject["effects"] = effects;


        if (effectsIncludeTransition(this.effects)) {
            instrumentObject["transition"] = Config.transitions[this.transition].name;
            instrumentObject["clicklessTransition"] = this.clicklessTransition;
        }
        if (effectsIncludeChord(this.effects)) {
            instrumentObject["chord"] = this.getChord().name;
            instrumentObject["fastTwoNoteArp"] = this.fastTwoNoteArp;
            instrumentObject["arpeggioSpeed"] = this.arpeggioSpeed;
        }
        if (effectsIncludePitchShift(this.effects)) {
            instrumentObject["pitchShiftSemitones"] = this.pitchShift;
        }
        if (effectsIncludeDetune(this.effects)) {
            instrumentObject["detuneCents"] = Synth.detuneToCents(this.detune);
        }
        if (effectsIncludeVibrato(this.effects)) {
            if (this.vibrato == -1) {
                this.vibrato = 5;
            }
            if (this.vibrato != 5) {
                instrumentObject["vibrato"] = Config.vibratos[this.vibrato].name;
            } else {
                instrumentObject["vibrato"] = "custom";
            }
            instrumentObject["vibratoDepth"] = this.vibratoDepth;
            instrumentObject["vibratoDelay"] = this.vibratoDelay;
            instrumentObject["vibratoSpeed"] = this.vibratoSpeed;
            instrumentObject["vibratoType"] = this.vibratoType;
        }
        if (effectsIncludeNoteFilter(this.effects)) {
            instrumentObject["noteFilterType"] = this.noteFilterType;
            instrumentObject["noteSimpleCut"] = this.noteFilterSimpleCut;
            instrumentObject["noteSimplePeak"] = this.noteFilterSimplePeak;
            instrumentObject["noteFilter"] = this.noteFilter.toJsonObject();

            for (let i: number = 0; i < Config.filterMorphCount; i++) {
                if (this.noteSubFilters[i] != null)
                    instrumentObject["noteSubFilters" + i] = this.noteSubFilters[i]!.toJsonObject();
            }
        }
        if (effectsIncludeDistortion(this.effects)) {
            instrumentObject["distortion"] = Math.round(100 * this.distortion / (Config.distortionRange - 1));
            instrumentObject["aliases"] = this.aliases;
        }
        if (effectsIncludeBitcrusher(this.effects)) {
            instrumentObject["bitcrusherOctave"] = (Config.bitcrusherFreqRange - 1 - this.bitcrusherFreq) * Config.bitcrusherOctaveStep;
            instrumentObject["bitcrusherQuantization"] = Math.round(100 * this.bitcrusherQuantization / (Config.bitcrusherQuantizationRange - 1));
        }
        if (effectsIncludePanning(this.effects)) {
            instrumentObject["pan"] = Math.round(100 * (this.pan - Config.panCenter) / Config.panCenter);
            instrumentObject["panDelay"] = this.panDelay;
        }
        if (effectsIncludeChorus(this.effects)) {
            instrumentObject["chorus"] = Math.round(100 * this.chorus / (Config.chorusRange - 1));
        }
        if (effectsIncludeEcho(this.effects)) {
            instrumentObject["echoSustain"] = Math.round(100 * this.echoSustain / (Config.echoSustainRange - 1));
            instrumentObject["echoDelayBeats"] = Math.round(1000 * (this.echoDelay + 1) * Config.echoDelayStepTicks / (Config.ticksPerPart * Config.partsPerBeat)) / 1000;
        }
        if (effectsIncludeReverb(this.effects)) {
            instrumentObject["reverb"] = Math.round(100 * this.reverb / (Config.reverbRange - 1));
        }

        if (this.type != InstrumentType.drumset) {
            instrumentObject["fadeInSeconds"] = Math.round(10000 * Synth.fadeInSettingToSeconds(this.fadeIn)) / 10000;
            instrumentObject["fadeOutTicks"] = Synth.fadeOutSettingToTicks(this.fadeOut);
        }

        if (this.type == InstrumentType.harmonics || this.type == InstrumentType.pickedString) {
            instrumentObject["harmonics"] = [];
            for (let i: number = 0; i < Config.harmonicsControlPoints; i++) {
                instrumentObject["harmonics"][i] = Math.round(100 * this.harmonicsWave.harmonics[i] / Config.harmonicsMax);
            }
        }

        if (this.type == InstrumentType.noise) {
            instrumentObject["wave"] = Config.chipNoises[this.chipNoise].name;
        } else if (this.type == InstrumentType.spectrum) {
            instrumentObject["spectrum"] = [];
            for (let i: number = 0; i < Config.spectrumControlPoints; i++) {
                instrumentObject["spectrum"][i] = Math.round(100 * this.spectrumWave.spectrum[i] / Config.spectrumMax);
            }
        } else if (this.type == InstrumentType.drumset) {
            instrumentObject["drums"] = [];
            for (let j: number = 0; j < Config.drumCount; j++) {
                const spectrum: number[] = [];
                for (let i: number = 0; i < Config.spectrumControlPoints; i++) {
                    spectrum[i] = Math.round(100 * this.drumsetSpectrumWaves[j].spectrum[i] / Config.spectrumMax);
                }
                instrumentObject["drums"][j] = {
                    "filterEnvelope": this.getDrumsetEnvelope(j).name,
                    "spectrum": spectrum,
                };
            }
        } else if (this.type == InstrumentType.chip) {
            instrumentObject["wave"] = Config.chipWaves[this.chipWave].name;
            instrumentObject["unison"] = Config.unisons[this.unison].name;
        } else if (this.type == InstrumentType.pwm) {
            instrumentObject["pulseWidth"] = this.pulseWidth;
        } else if (this.type == InstrumentType.pickedString) {
            instrumentObject["unison"] = Config.unisons[this.unison].name;
            instrumentObject["stringSustain"] = Math.round(100 * this.stringSustain / (Config.stringSustainRange - 1));
        } else if (this.type == InstrumentType.harmonics) {
            instrumentObject["unison"] = Config.unisons[this.unison].name;
        } else if (this.type == InstrumentType.fm || this.type == InstrumentType.fm6op) {
            const operatorArray: Object[] = [];
            for (const operator of this.operators) {
                operatorArray.push({
                    "frequency": Config.operatorFrequencies[operator.frequency].name,
                    "amplitude": operator.amplitude,
                    "waveform": Config.operatorWaves[operator.waveform].name,
                    "pulseWidth": operator.pulseWidth,
                });
            }
            if(this.type == InstrumentType.fm){
                instrumentObject["algorithm"] = Config.algorithms[this.algorithm].name;
                instrumentObject["feedbackType"] = Config.feedbacks[this.feedbackType].name;
                instrumentObject["feedbackAmplitude"] = this.feedbackAmplitude;
                instrumentObject["operators"] = operatorArray;
            } else {
                instrumentObject["algorithm"] = Config.algorithms6Op[this.algorithm6Op].name;
                instrumentObject["feedbackType"] = Config.feedbacks6Op[this.feedbackType6Op].name;
                instrumentObject["feedbackAmplitude"] = this.feedbackAmplitude;
                if(this.algorithm6Op == 0){
                    const customAlgorithm: any = {};
                    customAlgorithm["mods"] = this.customAlgorithm.modulatedBy;
                    customAlgorithm["carrierCount"] = this.customAlgorithm.carrierCount;
                    instrumentObject["customAlgorithm"] = customAlgorithm;
                }
                if(this.feedbackType6Op == 0){
                    const customFeedback: any = {};
                    customFeedback["mods"] = this.customFeedbackType.indices;
                    instrumentObject["customFeedback"] = customFeedback;
                }

                instrumentObject["operators"] = operatorArray;
            }
        } else if (this.type == InstrumentType.customChipWave) {
            instrumentObject["wave"] = Config.chipWaves[this.chipWave].name;
            instrumentObject["unison"] = Config.unisons[this.unison].name;
            instrumentObject["customChipWave"] = new Float64Array(64);
            instrumentObject["customChipWaveIntegral"] = new Float64Array(65);
            for (let i: number = 0; i < this.customChipWave.length; i++) {
                instrumentObject["customChipWave"][i] = this.customChipWave[i];
                // Meh, waste of space and can be inaccurate. It will be recalc'ed when instrument loads.
                //instrumentObject["customChipWaveIntegral"][i] = this.customChipWaveIntegral[i];
            }
        } else if (this.type == InstrumentType.mod) {
            instrumentObject["modChannels"] = [];
            instrumentObject["modInstruments"] = [];
            instrumentObject["modSettings"] = [];
            instrumentObject["modStatuses"] = [];
            for (let mod: number = 0; mod < Config.modCount; mod++) {
                instrumentObject["modChannels"][mod] = this.modChannels[mod];
                instrumentObject["modInstruments"][mod] = this.modInstruments[mod];
                instrumentObject["modSettings"][mod] = this.modulators[mod];
            }
        } else {
            throw new Error("Unrecognized instrument type");
        }

        const envelopes: any[] = [];
        for (let i = 0; i < this.envelopeCount; i++) {
            envelopes.push(this.envelopes[i].toJsonObject());
        }
        instrumentObject["envelopes"] = envelopes;

        return instrumentObject;
    }


    public fromJsonObject(instrumentObject: any, isNoiseChannel: boolean, isModChannel: boolean, useSlowerRhythm: boolean, useFastTwoNoteArp: boolean, legacyGlobalReverb: number = 0): void {
        if (instrumentObject == undefined) instrumentObject = {};

        let type: InstrumentType = Config.instrumentTypeNames.indexOf(instrumentObject["type"]);
        if (<any>type == -1) type = isModChannel ? InstrumentType.mod : (isNoiseChannel ? InstrumentType.noise : InstrumentType.chip);
        this.setTypeAndReset(type, isNoiseChannel, isModChannel);
        this.octaveOffset = isNoiseChannel || isModChannel ? 0 : clamp(-3, 4, instrumentObject["octaveOffset"] | 0);

        if (instrumentObject["preset"] != undefined) {
            this.preset = instrumentObject["preset"] >>> 0;
        }

        if (instrumentObject["volume"] != undefined) {
            this.volume = clamp(-Config.volumeRange / 2, (Config.volumeRange / 2) + 1, instrumentObject["volume"] | 0);
        } else {
            this.volume = 0;
        }

        if (Array.isArray(instrumentObject["effects"])) {
            let effects: number = 0;
            for (let i: number = 0; i < instrumentObject["effects"].length; i++) {
                effects = effects | (1 << Config.effectNames.indexOf(instrumentObject["effects"][i]));
            }
            this.effects = (effects & ((1 << EffectType.length) - 1));
        } else {
            // The index of these names is reinterpreted as a bitfield, which relies on reverb and chorus being the first effects!
            const legacyEffectsNames: string[] = ["none", "reverb", "chorus", "chorus & reverb"];
            this.effects = legacyEffectsNames.indexOf(instrumentObject["effects"]);
            if (this.effects == -1) this.effects = (this.type == InstrumentType.noise) ? 0 : 1;
        }

        this.transition = Config.transitions.dictionary["normal"].index; // default value.
        const transitionProperty: any = instrumentObject["transition"] || instrumentObject["envelope"]; // the transition property used to be called envelope, so check that too.
        if (transitionProperty != undefined) {
            let transition: Transition | undefined = Config.transitions.dictionary[transitionProperty];
            if (instrumentObject["fadeInSeconds"] == undefined || instrumentObject["fadeOutTicks"] == undefined) {
                const legacySettings = (<any>{
                    "binary": { transition: "interrupt", fadeInSeconds: 0.0, fadeOutTicks: -1 },
                    "seamless": { transition: "interrupt", fadeInSeconds: 0.0, fadeOutTicks: -1 },
                    "sudden": { transition: "normal", fadeInSeconds: 0.0, fadeOutTicks: -3 },
                    "hard": { transition: "normal", fadeInSeconds: 0.0, fadeOutTicks: -3 },
                    "smooth": { transition: "normal", fadeInSeconds: 0.025, fadeOutTicks: -3 },
                    "soft": { transition: "normal", fadeInSeconds: 0.025, fadeOutTicks: -3 },
                    // Note that the old slide transition has the same name as a new slide transition that is different.
                    // Only apply legacy settings if the instrument JSON was created before, based on the presence
                    // of the fade in/out fields.
                    "slide": { transition: "slide in pattern", fadeInSeconds: 0.025, fadeOutTicks: -3 },
                    "cross fade": { transition: "normal", fadeInSeconds: 0.04, fadeOutTicks: 6 },
                    "hard fade": { transition: "normal", fadeInSeconds: 0.0, fadeOutTicks: 48 },
                    "medium fade": { transition: "normal", fadeInSeconds: 0.0125, fadeOutTicks: 72 },
                    "soft fade": { transition: "normal", fadeInSeconds: 0.06, fadeOutTicks: 96 },
                })[transitionProperty];
                if (legacySettings != undefined) {
                    transition = Config.transitions.dictionary[legacySettings.transition];
                    // These may be overridden below.
                    this.fadeIn = Synth.secondsToFadeInSetting(legacySettings.fadeInSeconds);
                    this.fadeOut = Synth.ticksToFadeOutSetting(legacySettings.fadeOutTicks);
                }
            }
            if (transition != undefined) this.transition = transition.index;

            if (this.transition != Config.transitions.dictionary["normal"].index) {
                // Enable transition if it was used.
                this.effects = (this.effects | (1 << EffectType.transition));
            }
        }

        // Overrides legacy settings in transition above.
        if (instrumentObject["fadeInSeconds"] != undefined) {
            this.fadeIn = Synth.secondsToFadeInSetting(+instrumentObject["fadeInSeconds"]);
        }
        if (instrumentObject["fadeOutTicks"] != undefined) {
            this.fadeOut = Synth.ticksToFadeOutSetting(+instrumentObject["fadeOutTicks"]);
        }

        {
            // Note that the chord setting may be overridden by instrumentObject["chorus"] below.
            const chordProperty: any = instrumentObject["chord"];
            const legacyChordNames: Dictionary<string> = { "harmony": "simultaneous" };
            const chord: Chord | undefined = Config.chords.dictionary[legacyChordNames[chordProperty]] || Config.chords.dictionary[chordProperty];
            if (chord != undefined) {
                this.chord = chord.index;
            } else {
                // Different instruments have different default chord types based on historical behaviour.
                if (this.type == InstrumentType.noise) {
                    this.chord = Config.chords.dictionary["arpeggio"].index;
                } else if (this.type == InstrumentType.pickedString) {
                    this.chord = Config.chords.dictionary["strum"].index;
                } else if (this.type == InstrumentType.chip) {
                    this.chord = Config.chords.dictionary["arpeggio"].index;
                } else if (this.type == InstrumentType.fm||this.type == InstrumentType.fm6op) {
                    this.chord = Config.chords.dictionary["custom interval"].index;
                } else {
                    this.chord = Config.chords.dictionary["simultaneous"].index;
                }
            }
        }

        this.unison = Config.unisons.dictionary["none"].index; // default value.
        const unisonProperty: any = instrumentObject["unison"] || instrumentObject["interval"] || instrumentObject["chorus"]; // The unison property has gone by various names in the past.
        if (unisonProperty != undefined) {
            const legacyChorusNames: Dictionary<string> = { "union": "none", "fifths": "fifth", "octaves": "octave" };
            const unison: Unison | undefined = Config.unisons.dictionary[legacyChorusNames[unisonProperty]] || Config.unisons.dictionary[unisonProperty];
            if (unison != undefined) this.unison = unison.index;
        }
        if (instrumentObject["chorus"] == "custom harmony") {
            // The original chorus setting had an option that now maps to two different settings. Override those if necessary.
            this.unison = Config.unisons.dictionary["hum"].index;
            this.chord = Config.chords.dictionary["custom interval"].index;
        }
        if (this.chord != Config.chords.dictionary["simultaneous"].index && !Array.isArray(instrumentObject["effects"])) {
            // Enable chord if it was used.
            this.effects = (this.effects | (1 << EffectType.chord));
        }

        if (instrumentObject["pitchShiftSemitones"] != undefined) {
            this.pitchShift = clamp(0, Config.pitchShiftRange, Math.round(+instrumentObject["pitchShiftSemitones"]));
        }
        if (instrumentObject["detuneCents"] != undefined) {
            this.detune = clamp(Config.detuneMin, Config.detuneMax + 1, Math.round(Synth.centsToDetune(+instrume…114629 tokens truncated…ksPerArpeggio);
                if (chord.customInterval) {
                    const intervalOffset: number = tone.pitches[1 + getArpeggioPitchIndex(tone.pitchCount - 1, instrument.fastTwoNoteArp, arpeggio)] - tone.pitches[0];
                    specialIntervalMult = !isNoiseChannel && song.temperament != 0
                        ? song.getTunedFrequencyFromPitch(basePitch + tone.pitches[0] + intervalOffset) / song.getTunedFrequencyFromPitch(basePitch + tone.pitches[0])
                        : Math.pow(2.0, intervalOffset / 12.0);
                    tone.specialIntervalExpressionMult = Math.pow(2.0, -intervalOffset / pitchDamping);
                } else {
                    pitch = tone.pitches[getArpeggioPitchIndex(tone.pitchCount, instrument.fastTwoNoteArp, arpeggio)];
                }
            }

            const startPitch: number = basePitch + (pitch + intervalStart) * intervalScale;
            const endPitch: number = basePitch + (pitch + intervalEnd) * intervalScale;
            const frequencyRatio: number = isNoiseChannel || song.temperament == 0
                ? Math.pow(2.0, (intervalEnd - intervalStart) * intervalScale / 12.0)
                : song.getTunedFrequencyFromPitch(endPitch) / song.getTunedFrequencyFromPitch(startPitch);
            const basePhaseDeltaScale: number = Math.pow(frequencyRatio, 1.0 / roundedSamplesPerTick);
            let pitchExpressionStart: number;
            // TODO: use the second element of prevPitchExpressions for the unison voice, compute a separate expression delta for it.
            if (tone.prevPitchExpressions[0] != null) {
                pitchExpressionStart = tone.prevPitchExpressions[0]!;
            } else {
                pitchExpressionStart = Math.pow(2.0, -(startPitch - expressionReferencePitch) / pitchDamping);
            }
            const pitchExpressionEnd: number = Math.pow(2.0, -(endPitch - expressionReferencePitch) / pitchDamping);
            tone.prevPitchExpressions[0] = pitchExpressionEnd;
            let settingsExpressionMult: number = baseExpression * noteFilterExpression;

            if (instrument.type == InstrumentType.noise) {
                settingsExpressionMult *= Config.chipNoises[instrument.chipNoise].expression;
            }
            if (instrument.type == InstrumentType.chip) {
                settingsExpressionMult *= Config.chipWaves[instrument.chipWave].expression;
            }
            if (instrument.type == InstrumentType.pwm) {
                const basePulseWidth: number = getPulseWidthRatio(instrument.pulseWidth);

                // Check for PWM mods to this instrument
                let pulseWidthModStart: number = basePulseWidth;
                let pulseWidthModEnd: number = basePulseWidth;
                if (this.isModActive(Config.modulators.dictionary["pulse width"].index, channelIndex, tone.instrumentIndex)) {
                    pulseWidthModStart = (this.getModValue(Config.modulators.dictionary["pulse width"].index, channelIndex, tone.instrumentIndex, false)) / (Config.pulseWidthRange * 2);
                    pulseWidthModEnd = (this.getModValue(Config.modulators.dictionary["pulse width"].index, channelIndex, tone.instrumentIndex, true)) / (Config.pulseWidthRange * 2);
                }

                const pulseWidthStart: number = pulseWidthModStart * envelopeStarts[EnvelopeComputeIndex.pulseWidth];
                const pulseWidthEnd: number = pulseWidthModEnd * envelopeEnds[EnvelopeComputeIndex.pulseWidth];
                tone.pulseWidth = pulseWidthStart;
                tone.pulseWidthDelta = (pulseWidthEnd - pulseWidthStart) / roundedSamplesPerTick;
            }
            if (instrument.type == InstrumentType.pickedString) {
                // Check for sustain mods
                let useSustainStart: number = instrument.stringSustain;
                let useSustainEnd: number = instrument.stringSustain;
                if (this.isModActive(Config.modulators.dictionary["sustain"].index, channelIndex, tone.instrumentIndex)) {
                    useSustainStart = this.getModValue(Config.modulators.dictionary["sustain"].index, channelIndex, tone.instrumentIndex, false);
                    useSustainEnd = this.getModValue(Config.modulators.dictionary["sustain"].index, channelIndex, tone.instrumentIndex, true);
                }

                tone.stringSustainStart = useSustainStart;
                tone.stringSustainEnd = useSustainEnd;

                // Increase expression to compensate for string decay.
                settingsExpressionMult *= Math.pow(2.0, 0.7 * (1.0 - useSustainStart / (Config.stringSustainRange - 1)));

            }

            const startFreq: number = isNoiseChannel ? Instrument.frequencyFromPitch(startPitch) : song.getTunedFrequencyFromPitch(startPitch);
            if (instrument.type == InstrumentType.chip || instrument.type == InstrumentType.customChipWave || instrument.type == InstrumentType.harmonics || instrument.type == InstrumentType.pickedString) {
                // These instruments have two waves at different frequencies for the unison feature.
                const unison: Unison = Config.unisons[instrument.unison];
                const voiceCountExpression: number = (instrument.type == InstrumentType.pickedString) ? 1 : unison.voices / 2.0;
                settingsExpressionMult *= unison.expression * voiceCountExpression;
                const unisonEnvelopeStart = envelopeStarts[EnvelopeComputeIndex.unison];
                const unisonEnvelopeEnd = envelopeEnds[EnvelopeComputeIndex.unison];
                const unisonAStart: number = Math.pow(2.0, (unison.offset + unison.spread) * unisonEnvelopeStart / 12.0);
                const unisonAEnd: number = Math.pow(2.0, (unison.offset + unison.spread) * unisonEnvelopeEnd / 12.0);
                const unisonBStart: number = Math.pow(2.0, (unison.offset - unison.spread) * unisonEnvelopeStart / 12.0) * specialIntervalMult;
                const unisonBEnd: number = Math.pow(2.0, (unison.offset - unison.spread) * unisonEnvelopeEnd / 12.0) * specialIntervalMult;
                tone.phaseDeltas[0] = startFreq * sampleTime * unisonAStart;
                tone.phaseDeltas[1] = startFreq * sampleTime * unisonBStart;
                tone.phaseDeltaScales[0] = basePhaseDeltaScale * Math.pow(unisonAEnd / unisonAStart, 1.0 / roundedSamplesPerTick);
                tone.phaseDeltaScales[1] = basePhaseDeltaScale * Math.pow(unisonBEnd / unisonBStart, 1.0 / roundedSamplesPerTick);
            } else {
                tone.phaseDeltas[0] = startFreq * sampleTime;
                tone.phaseDeltaScales[0] = basePhaseDeltaScale;
            }

            let expressionStart: number = settingsExpressionMult * fadeExpressionStart * chordExpressionStart * pitchExpressionStart * envelopeStarts[EnvelopeComputeIndex.noteVolume];
            let expressionEnd: number = settingsExpressionMult * fadeExpressionEnd * chordExpressionEnd * pitchExpressionEnd * envelopeEnds[EnvelopeComputeIndex.noteVolume];

            // Check for mod-related volume delta
            if (this.isModActive(Config.modulators.dictionary["note volume"].index, channelIndex, tone.instrumentIndex)) {
                // Linear falloff below 0, normal volume formula above 0. Seems to work best for scaling since the normal volume mult formula has a big gap from -25 to -24.
                const startVal: number = this.getModValue(Config.modulators.dictionary["note volume"].index, channelIndex, tone.instrumentIndex, false);
                const endVal: number = this.getModValue(Config.modulators.dictionary["note volume"].index, channelIndex, tone.instrumentIndex, true)
                expressionStart *= ((startVal <= 0) ? ((startVal + Config.volumeRange / 2) / (Config.volumeRange / 2)) : Synth.instrumentVolumeToVolumeMult(startVal));
                expressionEnd *= ((endVal <= 0) ? ((endVal + Config.volumeRange / 2) / (Config.volumeRange / 2)) : Synth.instrumentVolumeToVolumeMult(endVal));
            }

            tone.expression = expressionStart;
            tone.expressionDelta = (expressionEnd - expressionStart) / roundedSamplesPerTick;


            if (instrument.type == InstrumentType.pickedString) {
                let stringDecayStart: number;
                if (tone.prevStringDecay != null) {
                    stringDecayStart = tone.prevStringDecay;
                } else {
                    const sustainEnvelopeStart: number = tone.envelopeComputer.envelopeStarts[EnvelopeComputeIndex.stringSustain];
                    stringDecayStart = 1.0 - Math.min(1.0, sustainEnvelopeStart * tone.stringSustainStart / (Config.stringSustainRange - 1));
                }
                const sustainEnvelopeEnd: number = tone.envelopeComputer.envelopeEnds[EnvelopeComputeIndex.stringSustain];
                let stringDecayEnd: number = 1.0 - Math.min(1.0, sustainEnvelopeEnd * tone.stringSustainEnd / (Config.stringSustainRange - 1));
                tone.prevStringDecay = stringDecayEnd;

                const unison: Unison = Config.unisons[instrument.unison];
                for (let i: number = tone.pickedStrings.length; i < unison.voices; i++) {
                    tone.pickedStrings[i] = new PickedString();
                }

                if (tone.atNoteStart && !transition.continues && !tone.forceContinueAtStart) {
                    for (const pickedString of tone.pickedStrings) {
                        // Force the picked string to retrigger the attack impulse at the start of the note.
                        pickedString.delayIndex = -1;
                    }
                }

                for (let i: number = 0; i < unison.voices; i++) {
                    tone.pickedStrings[i].update(this, instrumentState, tone, i, roundedSamplesPerTick, stringDecayStart, stringDecayEnd);
                }
            }
        }
    }

    public static getLFOAmplitude(instrument: Instrument, secondsIntoBar: number): number {
        let effect: number = 0.0;
        for (const vibratoPeriodSeconds of Config.vibratoTypes[instrument.vibratoType].periodsSeconds) {
            effect += Math.sin(Math.PI * 2.0 * secondsIntoBar / vibratoPeriodSeconds);
        }
        return effect;
    }


    public static getInstrumentSynthFunction(instrument: Instrument): Function {
        if (instrument.type == InstrumentType.fm) {
            const fingerprint: string = instrument.algorithm + "_" + instrument.feedbackType;
            if (Synth.fmSynthFunctionCache[fingerprint] == undefined) {
                const synthSource: string[] = [];

                for (const line of Synth.fmSourceTemplate) {
                    if (line.indexOf("// CARRIER OUTPUTS") != -1) {
                        const outputs: string[] = [];
                        for (let j: number = 0; j < Config.algorithms[instrument.algorithm].carrierCount; j++) {
                            outputs.push("operator" + j + "Scaled");
                        }
                        synthSource.push(line.replace("/*operator#Scaled*/", outputs.join(" + ")));
                    } else if (line.indexOf("// INSERT OPERATOR COMPUTATION HERE") != -1) {
                        for (let j: number = Config.operatorCount - 1; j >= 0; j--) {
                            for (const operatorLine of Synth.operatorSourceTemplate) {
                                if (operatorLine.indexOf("/* + operator@Scaled*/") != -1) {
                                    let modulators = "";
                                    for (const modulatorNumber of Config.algorithms[instrument.algorithm].modulatedBy[j]) {
                                        modulators += " + operator" + (modulatorNumber - 1) + "Scaled";
                                    }

                                    const feedbackIndices: ReadonlyArray<number> = Config.feedbacks[instrument.feedbackType].indices[j];
                                    if (feedbackIndices.length > 0) {
                                        modulators += " + feedbackMult * (";
                                        const feedbacks: string[] = [];
                                        for (const modulatorNumber of feedbackIndices) {
                                            feedbacks.push("operator" + (modulatorNumber - 1) + "Output");
                                        }
                                        modulators += feedbacks.join(" + ") + ")";
                                    }
                                    synthSource.push(operatorLine.replace(/\#/g, j + "").replace("/* + operator@Scaled*/", modulators));
                                } else {
                                    synthSource.push(operatorLine.replace(/\#/g, j + ""));
                                }
                            }
                        }
                    } else if (line.indexOf("#") != -1) {
                        for (let j: number = 0; j < Config.operatorCount; j++) {
                            synthSource.push(line.replace(/\#/g, j + ""));
                        }
                    } else {
                        synthSource.push(line);
                    }
                }

                //console.log(synthSource.join("\n"));

                Synth.fmSynthFunctionCache[fingerprint] = new Function("synth", "bufferIndex", "roundedSamplesPerTick", "tone", "instrumentState", synthSource.join("\n"));
            }
            return Synth.fmSynthFunctionCache[fingerprint];
        } else if (instrument.type == InstrumentType.chip) {
            return Synth.chipSynth;
        } else if (instrument.type == InstrumentType.customChipWave) {
            return Synth.chipSynth;
        } else if (instrument.type == InstrumentType.harmonics) {
            return Synth.harmonicsSynth;
        } else if (instrument.type == InstrumentType.pwm) {
            return Synth.pulseWidthSynth;
        } else if (instrument.type == InstrumentType.pickedString) {
            return Synth.pickedStringSynth;
        } else if (instrument.type == InstrumentType.noise) {
            return Synth.noiseSynth;
        } else if (instrument.type == InstrumentType.spectrum) {
            return Synth.spectrumSynth;
        } else if (instrument.type == InstrumentType.drumset) {
            return Synth.drumsetSynth;
        } else if (instrument.type == InstrumentType.mod) {
            return Synth.modSynth;
        } else if (instrument.type == InstrumentType.fm6op) {
            const fingerprint: string = instrument.customAlgorithm.name + "_" + instrument.customFeedbackType.name;
            if (Synth.fm6SynthFunctionCache[fingerprint] == undefined) {
                const synthSource: string[] = [];

                for (const line of Synth.fmSourceTemplate) {
                    if (line.indexOf("// CARRIER OUTPUTS") != -1) {
                        const outputs: string[] = [];
                        for (let j: number = 0; j < instrument.customAlgorithm.carrierCount; j++) {
                            outputs.push("operator" + j + "Scaled");
                        }
                        synthSource.push(line.replace("/*operator#Scaled*/", outputs.join(" + ")));
                    } else if (line.indexOf("// INSERT OPERATOR COMPUTATION HERE") != -1) {
                        for (let j: number = Config.operatorCount+2 - 1; j >= 0; j--) {
                            for (const operatorLine of Synth.operatorSourceTemplate) {
                                if (operatorLine.indexOf("/* + operator@Scaled*/") != -1) {
                                    let modulators = "";
                                    for (const modulatorNumber of instrument.customAlgorithm.modulatedBy[j]) {
                                        modulators += " + operator" + (modulatorNumber - 1) + "Scaled";
                                    }

                                    const feedbackIndices: ReadonlyArray<number> = instrument.customFeedbackType.indices[j];
                                    if (feedbackIndices.length > 0) {
                                        modulators += " + feedbackMult * (";
                                        const feedbacks: string[] = [];
                                        for (const modulatorNumber of feedbackIndices) {
                                            feedbacks.push("operator" + (modulatorNumber - 1) + "Output");
                                        }
                                        modulators += feedbacks.join(" + ") + ")";
                                    }
                                    synthSource.push(operatorLine.replace(/\#/g, j + "").replace("/* + operator@Scaled*/", modulators));
                                } else {
                                    synthSource.push(operatorLine.replace(/\#/g, j + ""));
                                }
                            }
                        }
                    } else if (line.indexOf("#") != -1) {
                        for (let j = 0; j < Config.operatorCount+2; j++) {
                            synthSource.push(line.replace(/\#/g, j + ""));
                        }
                    } else {
                        synthSource.push(line);
                    }
                }

                //console.log(synthSource.join("\n"));

                Synth.fm6SynthFunctionCache[fingerprint] = new Function("synth", "bufferIndex", "roundedSamplesPerTick", "tone", "instrumentState", synthSource.join("\n"));
            }
            return Synth.fm6SynthFunctionCache[fingerprint];
        }else{
            throw new Error("Unrecognized instrument type: " + instrument.type);
        }
    }

    private static chipSynth(synth: Synth, bufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrumentState: InstrumentState): void {
        const aliases: boolean = (effectsIncludeDistortion(instrumentState.effects) && instrumentState.aliases);
        const data: Float32Array = synth.tempMonoInstrumentSampleBuffer!;
        const wave: Float32Array = instrumentState.wave!;
        const volumeScale = instrumentState.volumeScale;

        const waveLength: number = wave.length - 1; // The first sample is duplicated at the end, don't double-count it.

        const unisonSign: number = tone.specialIntervalExpressionMult * instrumentState.unison!.sign;
        if (instrumentState.unison!.voices == 1 && !instrumentState.chord!.customInterval) tone.phases[1] = tone.phases[0];
        let phaseDeltaA: number = tone.phaseDeltas[0] * waveLength;
        let phaseDeltaB: number = tone.phaseDeltas[1] * waveLength;
        const phaseDeltaScaleA: number = +tone.phaseDeltaScales[0];
        const phaseDeltaScaleB: number = +tone.phaseDeltaScales[1];
        let expression: number = +tone.expression;
        const expressionDelta: number = +tone.expressionDelta;
        let phaseA: number = (tone.phases[0] % 1) * waveLength;
        let phaseB: number = (tone.phases[1] % 1) * waveLength;

        const filters: DynamicBiquadFilter[] = tone.noteFilters;
        const filterCount: number = tone.noteFilterCount | 0;
        let initialFilterInput1: number = +tone.initialNoteFilterInput1;
        let initialFilterInput2: number = +tone.initialNoteFilterInput2;
        const applyFilters: Function = Synth.applyFilters;
        let prevWaveIntegralA: number = 0;
        let prevWaveIntegralB: number = 0;

        if (!aliases) {
            const phaseAInt: number = phaseA | 0;
            const phaseBInt: number = phaseB | 0;
            const indexA: number = phaseAInt % waveLength;
            const indexB: number = phaseBInt % waveLength;
            const phaseRatioA: number = phaseA - phaseAInt;
            const phaseRatioB: number = phaseB - phaseBInt;
            prevWaveIntegralA = +wave[indexA];
            prevWaveIntegralB = +wave[indexB];
            prevWaveIntegralA += (wave[indexA + 1] - prevWaveIntegralA) * phaseRatioA;
            prevWaveIntegralB += (wave[indexB + 1] - prevWaveIntegralB) * phaseRatioB;
        }

        const stopIndex: number = bufferIndex + roundedSamplesPerTick;
        for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {

            phaseA += phaseDeltaA;
            phaseB += phaseDeltaB;

            let waveA: number;
            let waveB: number;
            let inputSample: number;

            if (aliases) {
                waveA = wave[(0 | phaseA) % waveLength];
                waveB = wave[(0 | phaseB) % waveLength];
                inputSample = waveA + waveB;
            } else {
                const phaseAInt: number = phaseA | 0;
                const phaseBInt: number = phaseB | 0;
                const indexA: number = phaseAInt % waveLength;
                const indexB: number = phaseBInt % waveLength;
                let nextWaveIntegralA: number = wave[indexA];
                let nextWaveIntegralB: number = wave[indexB];
                const phaseRatioA: number = phaseA - phaseAInt;
                const phaseRatioB: number = phaseB - phaseBInt;
                nextWaveIntegralA += (wave[indexA + 1] - nextWaveIntegralA) * phaseRatioA;
                nextWaveIntegralB += (wave[indexB + 1] - nextWaveIntegralB) * phaseRatioB;
                waveA = (nextWaveIntegralA - prevWaveIntegralA) / phaseDeltaA;
                waveB = (nextWaveIntegralB - prevWaveIntegralB) / phaseDeltaB;
                prevWaveIntegralA = nextWaveIntegralA;
                prevWaveIntegralB = nextWaveIntegralB;
                inputSample = waveA + waveB * unisonSign;
            }

            const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
            initialFilterInput2 = initialFilterInput1;
            initialFilterInput1 = inputSample;

            phaseDeltaA *= phaseDeltaScaleA;
            phaseDeltaB *= phaseDeltaScaleB;

            const output: number = sample * expression * volumeScale;
            expression += expressionDelta;

            data[sampleIndex] += output;
        }

        tone.phases[0] = phaseA / waveLength;
        tone.phases[1] = phaseB / waveLength;
        tone.phaseDeltas[0] = phaseDeltaA / waveLength;
        tone.phaseDeltas[1] = phaseDeltaB / waveLength;
        tone.expression = expression;

        synth.sanitizeFilters(filters);
        tone.initialNoteFilterInput1 = initialFilterInput1;
        tone.initialNoteFilterInput2 = initialFilterInput2;
    }

    private static harmonicsSynth(synth: Synth, bufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrumentState: InstrumentState): void {
        const data: Float32Array = synth.tempMonoInstrumentSampleBuffer!;
        const wave: Float32Array = instrumentState.wave!;
        const waveLength: number = wave.length - 1; // The first sample is duplicated at the end, don't double-count it.

        const unisonSign: number = tone.specialIntervalExpressionMult * instrumentState.unison!.sign;
        if (instrumentState.unison!.voices == 1 && !instrumentState.chord!.customInterval) tone.phases[1] = tone.phases[0];
        let phaseDeltaA: number = tone.phaseDeltas[0] * waveLength;
        let phaseDeltaB: number = tone.phaseDeltas[1] * waveLength;
        const phaseDeltaScaleA: number = +tone.phaseDeltaScales[0];
        const phaseDeltaScaleB: number = +tone.phaseDeltaScales[1];
        let expression: number = +tone.expression;
        const expressionDelta: number = +tone.expressionDelta;
        let phaseA: number = (tone.phases[0] % 1) * waveLength;
        let phaseB: number = (tone.phases[1] % 1) * waveLength;

        const filters: DynamicBiquadFilter[] = tone.noteFilters;
        const filterCount: number = tone.noteFilterCount | 0;
        let initialFilterInput1: number = +tone.initialNoteFilterInput1;
        let initialFilterInput2: number = +tone.initialNoteFilterInput2;
        const applyFilters: Function = Synth.applyFilters;

        const phaseAInt: number = phaseA | 0;
        const phaseBInt: number = phaseB | 0;
        const indexA: number = phaseAInt % waveLength;
        const indexB: number = phaseBInt % waveLength;
        const phaseRatioA: number = phaseA - phaseAInt;
        const phaseRatioB: number = phaseB - phaseBInt;
        let prevWaveIntegralA: number = +wave[indexA];
        let prevWaveIntegralB: number = +wave[indexB];
        prevWaveIntegralA += (wave[indexA + 1] - prevWaveIntegralA) * phaseRatioA;
        prevWaveIntegralB += (wave[indexB + 1] - prevWaveIntegralB) * phaseRatioB;

        const stopIndex: number = bufferIndex + roundedSamplesPerTick;
        for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {

            phaseA += phaseDeltaA;
            phaseB += phaseDeltaB;

            const phaseAInt: number = phaseA | 0;
            const phaseBInt: number = phaseB | 0;
            const indexA: number = phaseAInt % waveLength;
            const indexB: number = phaseBInt % waveLength;
            let nextWaveIntegralA: number = wave[indexA];
            let nextWaveIntegralB: number = wave[indexB];
            const phaseRatioA: number = phaseA - phaseAInt;
            const phaseRatioB: number = phaseB - phaseBInt;
            nextWaveIntegralA += (wave[indexA + 1] - nextWaveIntegralA) * phaseRatioA;
            nextWaveIntegralB += (wave[indexB + 1] - nextWaveIntegralB) * phaseRatioB;
            const waveA: number = (nextWaveIntegralA - prevWaveIntegralA) / phaseDeltaA;
            const waveB: number = (nextWaveIntegralB - prevWaveIntegralB) / phaseDeltaB;
            prevWaveIntegralA = nextWaveIntegralA;
            prevWaveIntegralB = nextWaveIntegralB;

            const inputSample: number = waveA + waveB * unisonSign;
            const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
            initialFilterInput2 = initialFilterInput1;
            initialFilterInput1 = inputSample;

            phaseDeltaA *= phaseDeltaScaleA;
            phaseDeltaB *= phaseDeltaScaleB;

            const output: number = sample * expression;
            expression += expressionDelta;

            data[sampleIndex] += output;
        }

        tone.phases[0] = phaseA / waveLength;
        tone.phases[1] = phaseB / waveLength;
        tone.phaseDeltas[0] = phaseDeltaA / waveLength;
        tone.phaseDeltas[1] = phaseDeltaB / waveLength;
        tone.expression = expression;

        synth.sanitizeFilters(filters);
        tone.initialNoteFilterInput1 = initialFilterInput1;
        tone.initialNoteFilterInput2 = initialFilterInput2;
    }

    private static pickedStringSynth(synth: Synth, bufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrumentState: InstrumentState): void {
        // This algorithm is similar to the Karpluss-Strong algorithm in principle, but with an
        // all-pass filter for dispersion and with more control over the impulse harmonics.
        // The source code is processed as a string before being compiled, in order to
        // handle the unison feature. If unison is disabled or set to none, then only one
        // string voice is required, otherwise two string voices are required. We only want
        // to compute the minimum possible number of string voices, so omit the code for
        // processing extra ones if possible. Any line containing a "#" is duplicated for
        // each required voice, replacing the "#" with the voice index.

        const voiceCount: number = instrumentState.unison!.voices;
        let pickedStringFunction: Function = Synth.pickedStringFunctionCache[voiceCount];
        if (pickedStringFunction == undefined) {
            let pickedStringSource: string = "";

            pickedStringSource += `
				const Config = beepbox.Config;
				const Synth = beepbox.Synth;
				const data = synth.tempMonoInstrumentSampleBuffer;
				
				let pickedString# = tone.pickedStrings[#];
				let allPassSample# = +pickedString#.allPassSample;
				let allPassPrevInput# = +pickedString#.allPassPrevInput;
				let shelfSample# = +pickedString#.shelfSample;
				let shelfPrevInput# = +pickedString#.shelfPrevInput;
				let fractionalDelaySample# = +pickedString#.fractionalDelaySample;
				const delayLine# = pickedString#.delayLine;
				const delayBufferMask# = (delayLine#.length - 1) >> 0;
				let delayIndex# = pickedString#.delayIndex|0;
				delayIndex# = (delayIndex# & delayBufferMask#) + delayLine#.length;
				let delayLength# = +pickedString#.prevDelayLength;
				const delayLengthDelta# = +pickedString#.delayLengthDelta;
				let allPassG# = +pickedString#.allPassG;
				let shelfA1# = +pickedString#.shelfA1;
				let shelfB0# = +pickedString#.shelfB0;
				let shelfB1# = +pickedString#.shelfB1;
				const allPassGDelta# = +pickedString#.allPassGDelta;
				const shelfA1Delta# = +pickedString#.shelfA1Delta;
				const shelfB0Delta# = +pickedString#.shelfB0Delta;
				const shelfB1Delta# = +pickedString#.shelfB1Delta;
				
				let expression = +tone.expression;
				const expressionDelta = +tone.expressionDelta;
				
				const unisonSign = tone.specialIntervalExpressionMult * instrumentState.unison.sign;
				const delayResetOffset# = pickedString#.delayResetOffset|0;
				
				const filters = tone.noteFilters;
				const filterCount = tone.noteFilterCount|0;
				let initialFilterInput1 = +tone.initialNoteFilterInput1;
				let initialFilterInput2 = +tone.initialNoteFilterInput2;
				const applyFilters = Synth.applyFilters;
				
				const stopIndex = bufferIndex + runLength;
				for (let sampleIndex = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
					const targetSampleTime# = delayIndex# - delayLength#;
					const lowerIndex# = (targetSampleTime# + 0.125) | 0; // Offset to improve stability of all-pass filter.
					const upperIndex# = lowerIndex# + 1;
					const fractionalDelay# = upperIndex# - targetSampleTime#;
					const fractionalDelayG# = (1.0 - fractionalDelay#) / (1.0 + fractionalDelay#); // Inlined version of FilterCoefficients.prototype.allPass1stOrderFractionalDelay
					const prevInput# = delayLine#[lowerIndex# & delayBufferMask#];
					const input# = delayLine#[upperIndex# & delayBufferMask#];
					fractionalDelaySample# = fractionalDelayG# * input# + prevInput# - fractionalDelayG# * fractionalDelaySample#;
					
					allPassSample# = fractionalDelaySample# * allPassG# + allPassPrevInput# - allPassG# * allPassSample#;
					allPassPrevInput# = fractionalDelaySample#;
					
					shelfSample# = shelfB0# * allPassSample# + shelfB1# * shelfPrevInput# - shelfA1# * shelfSample#;
					shelfPrevInput# = allPassSample#;
					
					delayLine#[delayIndex# & delayBufferMask#] += shelfSample#;
					delayLine#[(delayIndex# + delayResetOffset#) & delayBufferMask#] = 0.0;
					delayIndex#++;
					
					const inputSample = (`

            const sampleList: string[] = [];
            for (let voice: number = 0; voice < voiceCount; voice++) {
                sampleList.push("fractionalDelaySample" + voice + (voice == 1 ? " * unisonSign" : ""));
            }

            pickedStringSource += sampleList.join(" + ");

            pickedStringSource += `) * expression;
					const sample = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
					initialFilterInput2 = initialFilterInput1;
					initialFilterInput1 = inputSample;
					data[sampleIndex] += sample;
					
					expression += expressionDelta;
					delayLength# += delayLengthDelta#;
					allPassG# += allPassGDelta#;
					shelfA1# += shelfA1Delta#;
					shelfB0# += shelfB0Delta#;
					shelfB1# += shelfB1Delta#;
				}
				
				// Avoid persistent denormal or NaN values in the delay buffers and filter history.
				const epsilon = (1.0e-24);
				if (!Number.isFinite(allPassSample#) || Math.abs(allPassSample#) < epsilon) allPassSample# = 0.0;
				if (!Number.isFinite(allPassPrevInput#) || Math.abs(allPassPrevInput#) < epsilon) allPassPrevInput# = 0.0;
				if (!Number.isFinite(shelfSample#) || Math.abs(shelfSample#) < epsilon) shelfSample# = 0.0;
				if (!Number.isFinite(shelfPrevInput#) || Math.abs(shelfPrevInput#) < epsilon) shelfPrevInput# = 0.0;
				if (!Number.isFinite(fractionalDelaySample#) || Math.abs(fractionalDelaySample#) < epsilon) fractionalDelaySample# = 0.0;
				pickedString#.allPassSample = allPassSample#;
				pickedString#.allPassPrevInput = allPassPrevInput#;
				pickedString#.shelfSample = shelfSample#;
				pickedString#.shelfPrevInput = shelfPrevInput#;
				pickedString#.fractionalDelaySample = fractionalDelaySample#;
				pickedString#.delayIndex = delayIndex#;
				pickedString#.prevDelayLength = delayLength#;
				pickedString#.allPassG = allPassG#;
				pickedString#.shelfA1 = shelfA1#;
				pickedString#.shelfB0 = shelfB0#;
				pickedString#.shelfB1 = shelfB1#;
				
				tone.expression = expression;
				
				synth.sanitizeFilters(filters);
				tone.initialNoteFilterInput1 = initialFilterInput1;
				tone.initialNoteFilterInput2 = initialFilterInput2;`

            // Duplicate lines containing "#" for each voice and replace the "#" with the voice index.
            pickedStringSource = pickedStringSource.replace(/^.*\#.*$/mg, line => {
                const lines = [];
                for (let voice: number = 0; voice < voiceCount; voice++) {
                    lines.push(line.replace(/\#/g, String(voice)));
                }
                return lines.join("\n");
            });

            //console.log(pickedStringSource);
            pickedStringFunction = new Function("synth", "bufferIndex", "runLength", "tone", "instrumentState", pickedStringSource);
            Synth.pickedStringFunctionCache[voiceCount] = pickedStringFunction;
        }

        pickedStringFunction(synth, bufferIndex, roundedSamplesPerTick, tone, instrumentState);
    }

    private static effectsSynth(synth: Synth, outputDataL: Float32Array, outputDataR: Float32Array, bufferIndex: number, runLength: number, instrumentState: InstrumentState): void {
        // TODO: If automation is involved, don't assume sliders will stay at zero.
        // @jummbus - ^ Correct, removed the non-zero checks as modulation can change them.

        const usesDistortion: boolean = effectsIncludeDistortion(instrumentState.effects);
        const usesBitcrusher: boolean = effectsIncludeBitcrusher(instrumentState.effects);
        const usesEqFilter: boolean = instrumentState.eqFilterCount > 0;
        const usesPanning: boolean = effectsIncludePanning(instrumentState.effects);
        const usesChorus: boolean = effectsIncludeChorus(instrumentState.effects);
        const usesEcho: boolean = effectsIncludeEcho(instrumentState.effects);
        const usesReverb: boolean = effectsIncludeReverb(instrumentState.effects);
        let signature: number = 0; if (usesDistortion) signature = signature | 1;
        signature = signature << 1; if (usesBitcrusher) signature = signature | 1;
        signature = signature << 1; if (usesEqFilter) signature = signature | 1;
        signature = signature << 1; if (usesPanning) signature = signature | 1;
        signature = signature << 1; if (usesChorus) signature = signature | 1;
        signature = signature << 1; if (usesEcho) signature = signature | 1;
        signature = signature << 1; if (usesReverb) signature = signature | 1;

        let effectsFunction: Function = Synth.effectsFunctionCache[signature];
        if (effectsFunction == undefined) {
            let effectsSource: string = "";

            const usesDelays: boolean = usesChorus || usesReverb || usesEcho;

            effectsSource += `
				const Config = beepbox.Config;
				const tempMonoInstrumentSampleBuffer = synth.tempMonoInstrumentSampleBuffer;
				
				let mixVolume = +instrumentState.mixVolume;
				const mixVolumeDelta = +instrumentState.mixVolumeDelta;`

            if (usesDelays) {
                effectsSource += `
				
				let delayInputMult = +instrumentState.delayInputMult;
				const delayInputMultDelta = +instrumentState.delayInputMultDelta;`
            }

            if (usesDistortion) {
                // Distortion can sometimes create noticeable aliasing.
                // It seems the established industry best practice for distortion antialiasing
                // is to upsample the inputs ("zero stuffing" followed by a brick wall lowpass
                // at the original nyquist frequency), perform the distortion, then downsample
                // (the lowpass again followed by dropping in-between samples). This is
                // "mathematically correct" in that it preserves only the intended frequencies,
                // but it has several unfortunate tradeoffs depending on the choice of filter,
                // introducing latency and/or time smearing, since no true brick wall filter
                // exists. For the time being, I've opted to instead generate in-between input
                // samples using fractional delay all-pass filters, and after distorting them,
                // I "downsample" these with a simple weighted sum.

                effectsSource += `
				
				const distortionBaseVolume = +Config.distortionBaseVolume;
				let distortion = instrumentState.distortion;
				const distortionDelta = instrumentState.distortionDelta;
				let distortionDrive = instrumentState.distortionDrive;
				const distortionDriveDelta = instrumentState.distortionDriveDelta;
				const distortionFractionalResolution = 4.0;
				const distortionOversampleCompensation = distortionBaseVolume / distortionFractionalResolution;
				const distortionFractionalDelay1 = 1.0 / distortionFractionalResolution;
				const distortionFractionalDelay2 = 2.0 / distortionFractionalResolution;
				const distortionFractionalDelay3 = 3.0 / distortionFractionalResolution;
				const distortionFractionalDelayG1 = (1.0 - distortionFractionalDelay1) / (1.0 + distortionFractionalDelay1); // Inlined version of FilterCoefficients.prototype.allPass1stOrderFractionalDelay
				const distortionFractionalDelayG2 = (1.0 - distortionFractionalDelay2) / (1.0 + distortionFractionalDelay2); // Inlined version of FilterCoefficients.prototype.allPass1stOrderFractionalDelay
				const distortionFractionalDelayG3 = (1.0 - distortionFractionalDelay3) / (1.0 + distortionFractionalDelay3); // Inlined version of FilterCoefficients.prototype.allPass1stOrderFractionalDelay
				const distortionNextOutputWeight1 = Math.cos(Math.PI * distortionFractionalDelay1) * 0.5 + 0.5;
				const distortionNextOutputWeight2 = Math.cos(Math.PI * distortionFractionalDelay2) * 0.5 + 0.5;
				const distortionNextOutputWeight3 = Math.cos(Math.PI * distortionFractionalDelay3) * 0.5 + 0.5;
				const distortionPrevOutputWeight1 = 1.0 - distortionNextOutputWeight1;
				const distortionPrevOutputWeight2 = 1.0 - distortionNextOutputWeight2;
				const distortionPrevOutputWeight3 = 1.0 - distortionNextOutputWeight3;
				
				let distortionFractionalInput1 = +instrumentState.distortionFractionalInput1;
				let distortionFractionalInput2 = +instrumentState.distortionFractionalInput2;
				let distortionFractionalInput3 = +instrumentState.distortionFractionalInput3;
				let distortionPrevInput = +instrumentState.distortionPrevInput;
				let distortionNextOutput = +instrumentState.distortionNextOutput;`
            }

            if (usesBitcrusher) {
                effectsSource += `
				
				let bitcrusherPrevInput = +instrumentState.bitcrusherPrevInput;
				let bitcrusherCurrentOutput = +instrumentState.bitcrusherCurrentOutput;
				let bitcrusherPhase = +instrumentState.bitcrusherPhase;
				let bitcrusherPhaseDelta = +instrumentState.bitcrusherPhaseDelta;
				const bitcrusherPhaseDeltaScale = +instrumentState.bitcrusherPhaseDeltaScale;
				let bitcrusherScale = +instrumentState.bitcrusherScale;
				const bitcrusherScaleScale = +instrumentState.bitcrusherScaleScale;
				let bitcrusherFoldLevel = +instrumentState.bitcrusherFoldLevel;
				const bitcrusherFoldLevelScale = +instrumentState.bitcrusherFoldLevelScale;`
            }

            if (usesEqFilter) {
                effectsSource += `
				
				let filters = instrumentState.eqFilters;
				const filterCount = instrumentState.eqFilterCount|0;
				let initialFilterInput1 = +instrumentState.initialEqFilterInput1;
				let initialFilterInput2 = +instrumentState.initialEqFilterInput2;
				const applyFilters = beepbox.Synth.applyFilters;`
            }

            // The eq filter volume is also used to fade out the instrument state, so always include it.
            effectsSource += `
				
				let eqFilterVolume = +instrumentState.eqFilterVolume;
				const eqFilterVolumeDelta = +instrumentState.eqFilterVolumeDelta;`

            if (usesPanning) {
                effectsSource += `
				
				const panningMask = synth.panningDelayBufferMask >>> 0;
				const panningDelayLine = instrumentState.panningDelayLine;
				let panningDelayPos = instrumentState.panningDelayPos & panningMask;
				let   panningVolumeL      = +instrumentState.panningVolumeL;
				let   panningVolumeR      = +instrumentState.panningVolumeR;
				const panningVolumeDeltaL = +instrumentState.panningVolumeDeltaL;
				const panningVolumeDeltaR = +instrumentState.panningVolumeDeltaR;
				let   panningOffsetL      = +instrumentState.panningOffsetL;
				let   panningOffsetR      = +instrumentState.panningOffsetR;
				const panningOffsetDeltaL = 1.0 - instrumentState.panningOffsetDeltaL;
				const panningOffsetDeltaR = 1.0 - instrumentState.panningOffsetDeltaR;`
            }

            if (usesChorus) {
                effectsSource += `
				
				const chorusMask = synth.chorusDelayBufferMask >>> 0;
				const chorusDelayLineL = instrumentState.chorusDelayLineL;
				const chorusDelayLineR = instrumentState.chorusDelayLineR;
				instrumentState.chorusDelayLineDirty = true;
				let chorusDelayPos = instrumentState.chorusDelayPos & chorusMask;
				
				let chorusVoiceMult = +instrumentState.chorusVoiceMult;
				const chorusVoiceMultDelta = +instrumentState.chorusVoiceMultDelta;
				let chorusCombinedMult = +instrumentState.chorusCombinedMult;
				const chorusCombinedMultDelta = +instrumentState.chorusCombinedMultDelta;
				
				const chorusDuration = +beepbox.Config.chorusPeriodSeconds;
				const chorusAngle = Math.PI * 2.0 / (chorusDuration * synth.samplesPerSecond);
				const chorusRange = synth.samplesPerSecond * beepbox.Config.chorusDelayRange;
				const chorusOffset0 = synth.chorusDelayBufferSize - beepbox.Config.chorusDelayOffsets[0][0] * chorusRange;
				const chorusOffset1 = synth.chorusDelayBufferSize - beepbox.Config.chorusDelayOffsets[0][1] * chorusRange;
				const chorusOffset2 = synth.chorusDelayBufferSize - beepbox.Config.chorusDelayOffsets[0][2] * chorusRange;
				const chorusOffset3 = synth.chorusDelayBufferSize - beepbox.Config.chorusDelayOffsets[1][0] * chorusRange;
				const chorusOffset4 = synth.chorusDelayBufferSize - beepbox.Config.chorusDelayOffsets[1][1] * chorusRange;
				const chorusOffset5 = synth.chorusDelayBufferSize - beepbox.Config.chorusDelayOffsets[1][2] * chorusRange;
				let chorusPhase = instrumentState.chorusPhase % (Math.PI * 2.0);
				let chorusTap0Index = chorusDelayPos + chorusOffset0 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[0][0]);
				let chorusTap1Index = chorusDelayPos + chorusOffset1 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[0][1]);
				let chorusTap2Index = chorusDelayPos + chorusOffset2 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[0][2]);
				let chorusTap3Index = chorusDelayPos + chorusOffset3 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[1][0]);
				let chorusTap4Index = chorusDelayPos + chorusOffset4 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[1][1]);
				let chorusTap5Index = chorusDelayPos + chorusOffset5 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[1][2]);
				chorusPhase += chorusAngle * runLength;
				const chorusTap0End = chorusDelayPos + chorusOffset0 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[0][0]) + runLength;
				const chorusTap1End = chorusDelayPos + chorusOffset1 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[0][1]) + runLength;
				const chorusTap2End = chorusDelayPos + chorusOffset2 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[0][2]) + runLength;
				const chorusTap3End = chorusDelayPos + chorusOffset3 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[1][0]) + runLength;
				const chorusTap4End = chorusDelayPos + chorusOffset4 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[1][1]) + runLength;
				const chorusTap5End = chorusDelayPos + chorusOffset5 - chorusRange * Math.sin(chorusPhase + beepbox.Config.chorusPhaseOffsets[1][2]) + runLength;
				const chorusTap0Delta = (chorusTap0End - chorusTap0Index) / runLength;
				const chorusTap1Delta = (chorusTap1End - chorusTap1Index) / runLength;
				const chorusTap2Delta = (chorusTap2End - chorusTap2Index) / runLength;
				const chorusTap3Delta = (chorusTap3End - chorusTap3Index) / runLength;
				const chorusTap4Delta = (chorusTap4End - chorusTap4Index) / runLength;
				const chorusTap5Delta = (chorusTap5End - chorusTap5Index) / runLength;`
            }

            if (usesEcho) {
                effectsSource += `
				
				let echoMult = +instrumentState.echoMult;
				const echoMultDelta = +instrumentState.echoMultDelta;
				
				const echoDelayLineL = instrumentState.echoDelayLineL;
				const echoDelayLineR = instrumentState.echoDelayLineR;
				const echoMask = (echoDelayLineL.length - 1) >>> 0;
				instrumentState.echoDelayLineDirty = true;
				
				let echoDelayPos = instrumentState.echoDelayPos & echoMask;
				const echoDelayOffsetStart = (echoDelayLineL.length - instrumentState.echoDelayOffsetStart) & echoMask;
				const echoDelayOffsetEnd   = (echoDelayLineL.length - instrumentState.echoDelayOffsetEnd) & echoMask;
				let echoDelayOffsetRatio = +instrumentState.echoDelayOffsetRatio;
				const echoDelayOffsetRatioDelta = +instrumentState.echoDelayOffsetRatioDelta;
				
				const echoShelfA1 = +instrumentState.echoShelfA1;
				const echoShelfB0 = +instrumentState.echoShelfB0;
				const echoShelfB1 = +instrumentState.echoShelfB1;
				let echoShelfSampleL = +instrumentState.echoShelfSampleL;
				let echoShelfSampleR = +instrumentState.echoShelfSampleR;
				let echoShelfPrevInputL = +instrumentState.echoShelfPrevInputL;
				let echoShelfPrevInputR = +instrumentState.echoShelfPrevInputR;`
            }

            if (usesReverb) {
                effectsSource += `
				
				const reverbMask = Config.reverbDelayBufferMask >>> 0; //TODO: Dynamic reverb buffer size.
				const reverbDelayLine = instrumentState.reverbDelayLine;
				instrumentState.reverbDelayLineDirty = true;
				let reverbDelayPos = instrumentState.reverbDelayPos & reverbMask;
				
				let reverb = +instrumentState.reverbMult;
				const reverbDelta = +instrumentState.reverbMultDelta;
				
				const reverbShelfA1 = +instrumentState.reverbShelfA1;
				const reverbShelfB0 = +instrumentState.reverbShelfB0;
				const reverbShelfB1 = +instrumentState.reverbShelfB1;
				let reverbShelfSample0 = +instrumentState.reverbShelfSample0;
				let reverbShelfSample1 = +instrumentState.reverbShelfSample1;
				let reverbShelfSample2 = +instrumentState.reverbShelfSample2;
				let reverbShelfSample3 = +instrumentState.reverbShelfSample3;
				let reverbShelfPrevInput0 = +instrumentState.reverbShelfPrevInput0;
				let reverbShelfPrevInput1 = +instrumentState.reverbShelfPrevInput1;
				let reverbShelfPrevInput2 = +instrumentState.reverbShelfPrevInput2;
				let reverbShelfPrevInput3 = +instrumentState.reverbShelfPrevInput3;`
            }

            effectsSource += `
				
				const stopIndex = bufferIndex + runLength;
				for (let sampleIndex = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
					let sample = tempMonoInstrumentSampleBuffer[sampleIndex];
					tempMonoInstrumentSampleBuffer[sampleIndex] = 0.0;`

            if (usesDistortion) {
                effectsSource += `
					
					const distortionReverse = 1.0 - distortion;
					const distortionNextInput = sample * distortionDrive;
					sample = distortionNextOutput;
					distortionNextOutput = distortionNextInput / (distortionReverse * Math.abs(distortionNextInput) + distortion);
					distortionFractionalInput1 = distortionFractionalDelayG1 * distortionNextInput + distortionPrevInput - distortionFractionalDelayG1 * distortionFractionalInput1;
					distortionFractionalInput2 = distortionFractionalDelayG2 * distortionNextInput + distortionPrevInput - distortionFractionalDelayG2 * distortionFractionalInput2;
					distortionFractionalInput3 = distortionFractionalDelayG3 * distortionNextInput + distortionPrevInput - distortionFractionalDelayG3 * distortionFractionalInput3;
					const distortionOutput1 = distortionFractionalInput1 / (distortionReverse * Math.abs(distortionFractionalInput1) + distortion);
					const distortionOutput2 = distortionFractionalInput2 / (distortionReverse * Math.abs(distortionFractionalInput2) + distortion);
					const distortionOutput3 = distortionFractionalInput3 / (distortionReverse * Math.abs(distortionFractionalInput3) + distortion);
					distortionNextOutput += distortionOutput1 * distortionNextOutputWeight1 + distortionOutput2 * distortionNextOutputWeight2 + distortionOutput3 * distortionNextOutputWeight3;
					sample += distortionOutput1 * distortionPrevOutputWeight1 + distortionOutput2 * distortionPrevOutputWeight2 + distortionOutput3 * distortionPrevOutputWeight3;
					sample *= distortionOversampleCompensation;
					distortionPrevInput = distortionNextInput;
					distortion += distortionDelta;
					distortionDrive += distortionDriveDelta;`
            }

            if (usesBitcrusher) {
                effectsSource += `
					
					bitcrusherPhase += bitcrusherPhaseDelta;
					if (bitcrusherPhase < 1.0) {
						bitcrusherPrevInput = sample;
						sample = bitcrusherCurrentOutput;
					} else {
						bitcrusherPhase = bitcrusherPhase % 1.0;
						const ratio = bitcrusherPhase / bitcrusherPhaseDelta;
						
						const lerpedInput = sample + (bitcrusherPrevInput - sample) * ratio;
						bitcrusherPrevInput = sample;
						
						const bitcrusherWrapLevel = bitcrusherFoldLevel * 4.0;
						const wrappedSample = (((lerpedInput + bitcrusherFoldLevel) % bitcrusherWrapLevel) + bitcrusherWrapLevel) % bitcrusherWrapLevel;
						const foldedSample = bitcrusherFoldLevel - Math.abs(bitcrusherFoldLevel * 2.0 - wrappedSample);
						const scaledSample = foldedSample / bitcrusherScale;
						const oldValue = bitcrusherCurrentOutput;
						const newValue = (((scaledSample > 0 ? scaledSample + 1 : scaledSample)|0)-.5) * bitcrusherScale;
						
						sample = oldValue + (newValue - oldValue) * ratio;
						bitcrusherCurrentOutput = newValue;
					}
					bitcrusherPhaseDelta *= bitcrusherPhaseDeltaScale;
					bitcrusherScale *= bitcrusherScaleScale;
					bitcrusherFoldLevel *= bitcrusherFoldLevelScale;`
            }

            if (usesEqFilter) {
                effectsSource += `
					
					const inputSample = sample;
					sample = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
					initialFilterInput2 = initialFilterInput1;
					initialFilterInput1 = inputSample;`
            }

            // The eq filter volume is also used to fade out the instrument state, so always include it.
            effectsSource += `
					
					sample *= eqFilterVolume;
					eqFilterVolume += eqFilterVolumeDelta;`

            if (usesPanning) {
                effectsSource += `
					
					panningDelayLine[panningDelayPos] = sample;
					const panningRatioL  = panningOffsetL % 1;
					const panningRatioR  = panningOffsetR % 1;
					const panningTapLA   = panningDelayLine[(panningOffsetL) & panningMask];
					const panningTapLB   = panningDelayLine[(panningOffsetL + 1) & panningMask];
					const panningTapRA   = panningDelayLine[(panningOffsetR) & panningMask];
					const panningTapRB   = panningDelayLine[(panningOffsetR + 1) & panningMask];
					const panningTapL    = panningTapLA + (panningTapLB - panningTapLA) * panningRatioL;
					const panningTapR    = panningTapRA + (panningTapRB - panningTapRA) * panningRatioR;
					let sampleL = panningTapL * panningVolumeL;
					let sampleR = panningTapR * panningVolumeR;
					panningDelayPos = (panningDelayPos + 1) & panningMask;
					panningVolumeL += panningVolumeDeltaL;
					panningVolumeR += panningVolumeDeltaR;
					panningOffsetL += panningOffsetDeltaL;
					panningOffsetR += panningOffsetDeltaR;`
            } else {
                effectsSource += `
					
					let sampleL = sample;
					let sampleR = sample;`
            }

            if (usesChorus) {
                effectsSource += `
					
					const chorusTap0Ratio = chorusTap0Index % 1;
					const chorusTap1Ratio = chorusTap1Index % 1;
					const chorusTap2Ratio = chorusTap2Index % 1;
					const chorusTap3Ratio = chorusTap3Index % 1;
					const chorusTap4Ratio = chorusTap4Index % 1;
					const chorusTap5Ratio = chorusTap5Index % 1;
					const chorusTap0A = chorusDelayLineL[(chorusTap0Index) & chorusMask];
					const chorusTap0B = chorusDelayLineL[(chorusTap0Index + 1) & chorusMask];
					const chorusTap1A = chorusDelayLineL[(chorusTap1Index) & chorusMask];
					const chorusTap1B = chorusDelayLineL[(chorusTap1Index + 1) & chorusMask];
					const chorusTap2A = chorusDelayLineL[(chorusTap2Index) & chorusMask];
					const chorusTap2B = chorusDelayLineL[(chorusTap2Index + 1) & chorusMask];
					const chorusTap3A = chorusDelayLineR[(chorusTap3Index) & chorusMask];
					const chorusTap3B = chorusDelayLineR[(chorusTap3Index + 1) & chorusMask];
					const chorusTap4A = chorusDelayLineR[(chorusTap4Index) & chorusMask];
					const chorusTap4B = chorusDelayLineR[(chorusTap4Index + 1) & chorusMask];
					const chorusTap5A = chorusDelayLineR[(chorusTap5Index) & chorusMask];
					const chorusTap5B = chorusDelayLineR[(chorusTap5Index + 1) & chorusMask];
					const chorusTap0 = chorusTap0A + (chorusTap0B - chorusTap0A) * chorusTap0Ratio;
					const chorusTap1 = chorusTap1A + (chorusTap1B - chorusTap1A) * chorusTap1Ratio;
					const chorusTap2 = chorusTap2A + (chorusTap2B - chorusTap2A) * chorusTap2Ratio;
					const chorusTap3 = chorusTap3A + (chorusTap3B - chorusTap3A) * chorusTap3Ratio;
					const chorusTap4 = chorusTap4A + (chorusTap4B - chorusTap4A) * chorusTap4Ratio;
					const chorusTap5 = chorusTap5A + (chorusTap5B - chorusTap5A) * chorusTap5Ratio;
					chorusDelayLineL[chorusDelayPos] = sampleL * delayInputMult;
					chorusDelayLineR[chorusDelayPos] = sampleR * delayInputMult;
					sampleL = chorusCombinedMult * (sampleL + chorusVoiceMult * (chorusTap1 - chorusTap0 - chorusTap2));
					sampleR = chorusCombinedMult * (sampleR + chorusVoiceMult * (chorusTap4 - chorusTap3 - chorusTap5));
					chorusDelayPos = (chorusDelayPos + 1) & chorusMask;
					chorusTap0Index += chorusTap0Delta;
					chorusTap1Index += chorusTap1Delta;
					chorusTap2Index += chorusTap2Delta;
					chorusTap3Index += chorusTap3Delta;
					chorusTap4Index += chorusTap4Delta;
					chorusTap5Index += chorusTap5Delta;
					chorusVoiceMult += chorusVoiceMultDelta;
					chorusCombinedMult += chorusCombinedMultDelta;`
            }

            if (usesEcho) {
                effectsSource += `
					
					const echoTapStartIndex = (echoDelayPos + echoDelayOffsetStart) & echoMask;
					const echoTapEndIndex   = (echoDelayPos + echoDelayOffsetEnd  ) & echoMask;
					const echoTapStartL = echoDelayLineL[echoTapStartIndex];
					const echoTapEndL   = echoDelayLineL[echoTapEndIndex];
					const echoTapStartR = echoDelayLineR[echoTapStartIndex];
					const echoTapEndR   = echoDelayLineR[echoTapEndIndex];
					const echoTapL = (echoTapStartL + (echoTapEndL - echoTapStartL) * echoDelayOffsetRatio) * echoMult;
					const echoTapR = (echoTapStartR + (echoTapEndR - echoTapStartR) * echoDelayOffsetRatio) * echoMult;
					
					echoShelfSampleL = echoShelfB0 * echoTapL + echoShelfB1 * echoShelfPrevInputL - echoShelfA1 * echoShelfSampleL;
					echoShelfSampleR = echoShelfB0 * echoTapR + echoShelfB1 * echoShelfPrevInputR - echoShelfA1 * echoShelfSampleR;
					echoShelfPrevInputL = echoTapL;
					echoShelfPrevInputR = echoTapR;
					sampleL += echoShelfSampleL;
					sampleR += echoShelfSampleR;
					
					echoDelayLineL[echoDelayPos] = sampleL * delayInputMult;
					echoDelayLineR[echoDelayPos] = sampleR * delayInputMult;
					echoDelayPos = (echoDelayPos + 1) & echoMask;
					echoDelayOffsetRatio += echoDelayOffsetRatioDelta;
					echoMult += echoMultDelta;
                    `
            }

            if (usesReverb) {
                effectsSource += `
					
					// Reverb, implemented using a feedback delay network with a Hadamard matrix and lowpass filters.
					// good ratios:    0.555235 + 0.618033 + 0.818 +   1.0 = 2.991268
					// Delay lengths:  3041     + 3385     + 4481  +  5477 = 16384 = 2^14
					// Buffer offsets: 3041    -> 6426   -> 10907 -> 16384
					const reverbDelayPos1 = (reverbDelayPos +  3041) & reverbMask;
					const reverbDelayPos2 = (reverbDelayPos +  6426) & reverbMask;
					const reverbDelayPos3 = (reverbDelayPos + 10907) & reverbMask;
					const reverbSample0 = (reverbDelayLine[reverbDelayPos]);
					const reverbSample1 = reverbDelayLine[reverbDelayPos1];
					const reverbSample2 = reverbDelayLine[reverbDelayPos2];
					const reverbSample3 = reverbDelayLine[reverbDelayPos3];
					const reverbTemp0 = -(reverbSample0 + sampleL) + reverbSample1;
					const reverbTemp1 = -(reverbSample0 + sampleR) - reverbSample1;
					const reverbTemp2 = -reverbSample2 + reverbSample3;
					const reverbTemp3 = -reverbSample2 - reverbSample3;
					const reverbShelfInput0 = (reverbTemp0 + reverbTemp2) * reverb;
					const reverbShelfInput1 = (reverbTemp1 + reverbTemp3) * reverb;
					const reverbShelfInput2 = (reverbTemp0 - reverbTemp2) * reverb;
					const reverbShelfInput3 = (reverbTemp1 - reverbTemp3) * reverb;
					reverbShelfSample0 = reverbShelfB0 * reverbShelfInput0 + reverbShelfB1 * reverbShelfPrevInput0 - reverbShelfA1 * reverbShelfSample0;
					reverbShelfSample1 = reverbShelfB0 * reverbShelfInput1 + reverbShelfB1 * reverbShelfPrevInput1 - reverbShelfA1 * reverbShelfSample1;
					reverbShelfSample2 = reverbShelfB0 * reverbShelfInput2 + reverbShelfB1 * reverbShelfPrevInput2 - reverbShelfA1 * reverbShelfSample2;
					reverbShelfSample3 = reverbShelfB0 * reverbShelfInput3 + reverbShelfB1 * reverbShelfPrevInput3 - reverbShelfA1 * reverbShelfSample3;
					reverbShelfPrevInput0 = reverbShelfInput0;
					reverbShelfPrevInput1 = reverbShelfInput1;
					reverbShelfPrevInput2 = reverbShelfInput2;
					reverbShelfPrevInput3 = reverbShelfInput3;
					reverbDelayLine[reverbDelayPos1] = reverbShelfSample0 * delayInputMult;
					reverbDelayLine[reverbDelayPos2] = reverbShelfSample1 * delayInputMult;
					reverbDelayLine[reverbDelayPos3] = reverbShelfSample2 * delayInputMult;
					reverbDelayLine[reverbDelayPos ] = reverbShelfSample3 * delayInputMult;
					reverbDelayPos = (reverbDelayPos + 1) & reverbMask;
					sampleL += reverbSample1 + reverbSample2 + reverbSample3;
					sampleR += reverbSample0 + reverbSample2 - reverbSample3;
					reverb += reverbDelta;`
            }

            effectsSource += `
					
					outputDataL[sampleIndex] += sampleL * mixVolume;
					outputDataR[sampleIndex] += sampleR * mixVolume;
					mixVolume += mixVolumeDelta;`

            if (usesDelays) {
                effectsSource += `
					
					delayInputMult += delayInputMultDelta;`
            }

            effectsSource += `
				}
				
				instrumentState.mixVolume = mixVolume;
				instrumentState.eqFilterVolume = eqFilterVolume;
				
				// Avoid persistent denormal or NaN values in the delay buffers and filter history.
				const epsilon = (1.0e-24);`

            if (usesDelays) {
                effectsSource += `
				
				instrumentState.delayInputMult = delayInputMult;`
            }

            if (usesDistortion) {
                effectsSource += `
				
				instrumentState.distortion = distortion;
				instrumentState.distortionDrive = distortionDrive;
				
				if (!Number.isFinite(distortionFractionalInput1) || Math.abs(distortionFractionalInput1) < epsilon) distortionFractionalInput1 = 0.0;
				if (!Number.isFinite(distortionFractionalInput2) || Math.abs(distortionFractionalInput2) < epsilon) distortionFractionalInput2 = 0.0;
				if (!Number.isFinite(distortionFractionalInput3) || Math.abs(distortionFractionalInput3) < epsilon) distortionFractionalInput3 = 0.0;
				if (!Number.isFinite(distortionPrevInput) || Math.abs(distortionPrevInput) < epsilon) distortionPrevInput = 0.0;
				if (!Number.isFinite(distortionNextOutput) || Math.abs(distortionNextOutput) < epsilon) distortionNextOutput = 0.0;
				
				instrumentState.distortionFractionalInput1 = distortionFractionalInput1;
				instrumentState.distortionFractionalInput2 = distortionFractionalInput2;
				instrumentState.distortionFractionalInput3 = distortionFractionalInput3;
				instrumentState.distortionPrevInput = distortionPrevInput;
				instrumentState.distortionNextOutput = distortionNextOutput;`
            }

            if (usesBitcrusher) {
                effectsSource += `
					
				if (Math.abs(bitcrusherPrevInput) < epsilon) bitcrusherPrevInput = 0.0;
				if (Math.abs(bitcrusherCurrentOutput) < epsilon) bitcrusherCurrentOutput = 0.0;
				instrumentState.bitcrusherPrevInput = bitcrusherPrevInput;
				instrumentState.bitcrusherCurrentOutput = bitcrusherCurrentOutput;
				instrumentState.bitcrusherPhase = bitcrusherPhase;
				instrumentState.bitcrusherPhaseDelta = bitcrusherPhaseDelta;
				instrumentState.bitcrusherScale = bitcrusherScale;
				instrumentState.bitcrusherFoldLevel = bitcrusherFoldLevel;`

            }

            if (usesEqFilter) {
                effectsSource += `
					
				synth.sanitizeFilters(filters);
				// The filter input here is downstream from another filter so we
				// better make sure it's safe too.
				if (!(initialFilterInput1 < 100) || !(initialFilterInput2 < 100)) {
					initialFilterInput1 = 0.0;
					initialFilterInput2 = 0.0;
				}
				if (Math.abs(initialFilterInput1) < epsilon) initialFilterInput1 = 0.0;
				if (Math.abs(initialFilterInput2) < epsilon) initialFilterInput2 = 0.0;
				instrumentState.initialEqFilterInput1 = initialFilterInput1;
				instrumentState.initialEqFilterInput2 = initialFilterInput2;`
            }

            if (usesPanning) {
                effectsSource += `
				
				beepbox.Synth.sanitizeDelayLine(panningDelayLine, panningDelayPos, panningMask);
				instrumentState.panningDelayPos = panningDelayPos;
				instrumentState.panningVolumeL = panningVolumeL;
				instrumentState.panningVolumeR = panningVolumeR;
				instrumentState.panningOffsetL = panningOffsetL;
				instrumentState.panningOffsetR = panningOffsetR;`
            }

            if (usesChorus) {
                effectsSource += `
				
				beepbox.Synth.sanitizeDelayLine(chorusDelayLineL, chorusDelayPos, chorusMask);
				beepbox.Synth.sanitizeDelayLine(chorusDelayLineR, chorusDelayPos, chorusMask);
				instrumentState.chorusPhase = chorusPhase;
				instrumentState.chorusDelayPos = chorusDelayPos;
				instrumentState.chorusVoiceMult = chorusVoiceMult;
				instrumentState.chorusCombinedMult = chorusCombinedMult;`
            }

            if (usesEcho) {
                effectsSource += `
				
				beepbox.Synth.sanitizeDelayLine(echoDelayLineL, echoDelayPos, echoMask);
				beepbox.Synth.sanitizeDelayLine(echoDelayLineR, echoDelayPos, echoMask);
				instrumentState.echoDelayPos = echoDelayPos;
				instrumentState.echoMult = echoMult;
				instrumentState.echoDelayOffsetRatio = echoDelayOffsetRatio;
				
				if (!Number.isFinite(echoShelfSampleL) || Math.abs(echoShelfSampleL) < epsilon) echoShelfSampleL = 0.0;
				if (!Number.isFinite(echoShelfSampleR) || Math.abs(echoShelfSampleR) < epsilon) echoShelfSampleR = 0.0;
				if (!Number.isFinite(echoShelfPrevInputL) || Math.abs(echoShelfPrevInputL) < epsilon) echoShelfPrevInputL = 0.0;
				if (!Number.isFinite(echoShelfPrevInputR) || Math.abs(echoShelfPrevInputR) < epsilon) echoShelfPrevInputR = 0.0;
				instrumentState.echoShelfSampleL = echoShelfSampleL;
				instrumentState.echoShelfSampleR = echoShelfSampleR;
				instrumentState.echoShelfPrevInputL = echoShelfPrevInputL;
				instrumentState.echoShelfPrevInputR = echoShelfPrevInputR;`
            }

            if (usesReverb) {
                effectsSource += `
				
				beepbox.Synth.sanitizeDelayLine(reverbDelayLine, reverbDelayPos        , reverbMask);
				beepbox.Synth.sanitizeDelayLine(reverbDelayLine, reverbDelayPos +  3041, reverbMask);
				beepbox.Synth.sanitizeDelayLine(reverbDelayLine, reverbDelayPos +  6426, reverbMask);
				beepbox.Synth.sanitizeDelayLine(reverbDelayLine, reverbDelayPos + 10907, reverbMask);
				instrumentState.reverbDelayPos = reverbDelayPos;
				instrumentState.reverbMult = reverb;
				
				if (!Number.isFinite(reverbShelfSample0) || Math.abs(reverbShelfSample0) < epsilon) reverbShelfSample0 = 0.0;
				if (!Number.isFinite(reverbShelfSample1) || Math.abs(reverbShelfSample1) < epsilon) reverbShelfSample1 = 0.0;
				if (!Number.isFinite(reverbShelfSample2) || Math.abs(reverbShelfSample2) < epsilon) reverbShelfSample2 = 0.0;
				if (!Number.isFinite(reverbShelfSample3) || Math.abs(reverbShelfSample3) < epsilon) reverbShelfSample3 = 0.0;
				if (!Number.isFinite(reverbShelfPrevInput0) || Math.abs(reverbShelfPrevInput0) < epsilon) reverbShelfPrevInput0 = 0.0;
				if (!Number.isFinite(reverbShelfPrevInput1) || Math.abs(reverbShelfPrevInput1) < epsilon) reverbShelfPrevInput1 = 0.0;
				if (!Number.isFinite(reverbShelfPrevInput2) || Math.abs(reverbShelfPrevInput2) < epsilon) reverbShelfPrevInput2 = 0.0;
				if (!Number.isFinite(reverbShelfPrevInput3) || Math.abs(reverbShelfPrevInput3) < epsilon) reverbShelfPrevInput3 = 0.0;
				instrumentState.reverbShelfSample0 = reverbShelfSample0;
				instrumentState.reverbShelfSample1 = reverbShelfSample1;
				instrumentState.reverbShelfSample2 = reverbShelfSample2;
				instrumentState.reverbShelfSample3 = reverbShelfSample3;
				instrumentState.reverbShelfPrevInput0 = reverbShelfPrevInput0;
				instrumentState.reverbShelfPrevInput1 = reverbShelfPrevInput1;
				instrumentState.reverbShelfPrevInput2 = reverbShelfPrevInput2;
				instrumentState.reverbShelfPrevInput3 = reverbShelfPrevInput3;`
            }

            //console.log(effectsSource);
            effectsFunction = new Function("synth", "outputDataL", "outputDataR", "bufferIndex", "runLength", "instrumentState", effectsSource);
            Synth.effectsFunctionCache[signature] = effectsFunction;
        }

        effectsFunction(synth, outputDataL, outputDataR, bufferIndex, runLength, instrumentState);
    }

    private static pulseWidthSynth(synth: Synth, bufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrument: Instrument): void {
        const data: Float32Array = synth.tempMonoInstrumentSampleBuffer!;

        let phaseDelta: number = tone.phaseDeltas[0];
        const phaseDeltaScale: number = +tone.phaseDeltaScales[0];
        let expression: number = +tone.expression;
        const expressionDelta: number = +tone.expressionDelta;
        let phase: number = (tone.phases[0] % 1);

        let pulseWidth: number = tone.pulseWidth;
        const pulseWidthDelta: number = tone.pulseWidthDelta;

        const filters: DynamicBiquadFilter[] = tone.noteFilters;
        const filterCount: number = tone.noteFilterCount | 0;
        let initialFilterInput1: number = +tone.initialNoteFilterInput1;
        let initialFilterInput2: number = +tone.initialNoteFilterInput2;
        const applyFilters: Function = Synth.applyFilters;

        const stopIndex: number = bufferIndex + roundedSamplesPerTick;
        for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {

            const sawPhaseA: number = phase % 1;
            const sawPhaseB: number = (phase + pulseWidth) % 1;

            let pulseWave: number = sawPhaseB - sawPhaseA;

            // This is a PolyBLEP, which smooths out discontinuities at any frequency to reduce aliasing. 
            if (!instrument.aliases) {
                if (sawPhaseA < phaseDelta) {
                    var t = sawPhaseA / phaseDelta;
                    pulseWave += (t + t - t * t - 1) * 0.5;
                } else if (sawPhaseA > 1.0 - phaseDelta) {
                    var t = (sawPhaseA - 1.0) / phaseDelta;
                    pulseWave += (t + t + t * t + 1) * 0.5;
                }
                if (sawPhaseB < phaseDelta) {
                    var t = sawPhaseB / phaseDelta;
                    pulseWave -= (t + t - t * t - 1) * 0.5;
                } else if (sawPhaseB > 1.0 - phaseDelta) {
                    var t = (sawPhaseB - 1.0) / phaseDelta;
                    pulseWave -= (t + t + t * t + 1) * 0.5;
                }
            }

            const inputSample: number = pulseWave;
            const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
            initialFilterInput2 = initialFilterInput1;
            initialFilterInput1 = inputSample;

            phase += phaseDelta;
            phaseDelta *= phaseDeltaScale;
            pulseWidth += pulseWidthDelta;

            const output: number = sample * expression;
            expression += expressionDelta;

            data[sampleIndex] += output;
        }

        tone.phases[0] = phase;
        tone.phaseDeltas[0] = phaseDelta;
        tone.expression = expression;
        tone.pulseWidth = pulseWidth;

        synth.sanitizeFilters(filters);
        tone.initialNoteFilterInput1 = initialFilterInput1;
        tone.initialNoteFilterInput2 = initialFilterInput2;
    }

    private static fmSourceTemplate: string[] = (`
		const data = synth.tempMonoInstrumentSampleBuffer;
		const sineWave = beepbox.Config.sineWave;
			
		// I'm adding 1000 to the phase to ensure that it's never negative even when modulated by other waves because negative numbers don't work with the modulus operator very well.
		let operator#Phase       = +((tone.phases[#] % 1) + 1000) * ` + Config.sineWaveLength + `;
		let operator#PhaseDelta  = +tone.phaseDeltas[#] * ` + Config.sineWaveLength + `;
		let operator#PhaseDeltaScale = +tone.phaseDeltaScales[#];
		let operator#OutputMult  = +tone.operatorExpressions[#];
		const operator#OutputDelta = +tone.operatorExpressionDeltas[#];
		let operator#Output      = +tone.feedbackOutputs[#];
        const operator#Wave      = tone.operatorWaves[#].samples;
		let feedbackMult         = +tone.feedbackMult;
		const feedbackDelta        = +tone.feedbackDelta;
        let expression = +tone.expression;
		const expressionDelta = +tone.expressionDelta;
		
		const filters = tone.noteFilters;
		const filterCount = tone.noteFilterCount|0;
		let initialFilterInput1 = +tone.initialNoteFilterInput1;
		let initialFilterInput2 = +tone.initialNoteFilterInput2;
		const applyFilters = beepbox.Synth.applyFilters;
		
		const stopIndex = bufferIndex + roundedSamplesPerTick;
		for (let sampleIndex = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
				// INSERT OPERATOR COMPUTATION HERE
				const fmOutput = (/*operator#Scaled*/); // CARRIER OUTPUTS
				
			const inputSample = fmOutput;
			const sample = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
			initialFilterInput2 = initialFilterInput1;
			initialFilterInput1 = inputSample;
				
				feedbackMult += feedbackDelta;
				operator#OutputMult += operator#OutputDelta;
				operator#Phase += operator#PhaseDelta;
			operator#PhaseDelta *= operator#PhaseDeltaScale;
			
			const output = sample * expression;
			expression += expressionDelta;

			data[sampleIndex] += output;
			}
			
			tone.phases[#] = operator#Phase / ` + Config.sineWaveLength + `;
			tone.phaseDeltas[#] = operator#PhaseDelta / ` + Config.sineWaveLength + `;
			tone.operatorExpressions[#] = operator#OutputMult;
		    tone.feedbackOutputs[#] = operator#Output;
		    tone.feedbackMult = feedbackMult;
		    tone.expression = expression;
			
		synth.sanitizeFilters(filters);
		tone.initialNoteFilterInput1 = initialFilterInput1;
		tone.initialNoteFilterInput2 = initialFilterInput2;
		`).split("\n");

    private static operatorSourceTemplate: string[] = (`
				const operator#PhaseMix = operator#Phase/* + operator@Scaled*/;
				const operator#PhaseInt = operator#PhaseMix|0;
				const operator#Index    = operator#PhaseInt & ` + Config.sineWaveMask + `;
                const operator#Sample   = operator#Wave[operator#Index];
                operator#Output         = operator#Sample + (operator#Wave[operator#Index + 1] - operator#Sample) * (operator#PhaseMix - operator#PhaseInt);
				const operator#Scaled   = operator#OutputMult * operator#Output;
		`).split("\n");

    private static noiseSynth(synth: Synth, bufferIndex: number, runLength: number, tone: Tone, instrumentState: InstrumentState): void {
        const data: Float32Array = synth.tempMonoInstrumentSampleBuffer!;
        const wave: Float32Array = instrumentState.wave!;
        let phaseDelta: number = +tone.phaseDeltas[0];
        const phaseDeltaScale: number = +tone.phaseDeltaScales[0];
        let expression: number = +tone.expression;
        const expressionDelta: number = +tone.expressionDelta;
        let phase: number = (tone.phases[0] % 1) * Config.chipNoiseLength;
        if (tone.phases[0] == 0) {
            // Zero phase means the tone was reset, just give noise a random start phase instead.
            phase = Math.random() * Config.chipNoiseLength;
        }
        const phaseMask: number = Config.chipNoiseLength - 1;
        let noiseSample: number = +tone.noiseSample;

        const filters: DynamicBiquadFilter[] = tone.noteFilters;
        const filterCount: number = tone.noteFilterCount | 0;
        let initialFilterInput1: number = +tone.initialNoteFilterInput1;
        let initialFilterInput2: number = +tone.initialNoteFilterInput2;
        const applyFilters: Function = Synth.applyFilters;

        // This is for a "legacy" style simplified 1st order lowpass filter with
        // a cutoff frequency that is relative to the tone's fundamental frequency.
        const pitchRelativefilter: number = Math.min(1.0, phaseDelta * instrumentState.noisePitchFilterMult);

        const stopIndex: number = bufferIndex + runLength;
        for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
            const waveSample: number = wave[phase & phaseMask];

            noiseSample += (waveSample - noiseSample) * pitchRelativefilter;

            const inputSample: number = noiseSample;
            const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
            initialFilterInput2 = initialFilterInput1;
            initialFilterInput1 = inputSample;

            phase += phaseDelta;
            phaseDelta *= phaseDeltaScale;

            const output: number = sample * expression;
            expression += expressionDelta;

            data[sampleIndex] += output;
        }

        tone.phases[0] = phase / Config.chipNoiseLength;
        tone.phaseDeltas[0] = phaseDelta;
        tone.expression = expression;
        tone.noiseSample = noiseSample;

        synth.sanitizeFilters(filters);
        tone.initialNoteFilterInput1 = initialFilterInput1;
        tone.initialNoteFilterInput2 = initialFilterInput2;
    }

    private static spectrumSynth(synth: Synth, bufferIndex: number, runLength: number, tone: Tone, instrumentState: InstrumentState): void {
        const data: Float32Array = synth.tempMonoInstrumentSampleBuffer!;
        const wave: Float32Array = instrumentState.wave!;
        const samplesInPeriod: number = (1 << 7);
        let phaseDelta: number = tone.phaseDeltas[0] * samplesInPeriod;
        const phaseDeltaScale: number = +tone.phaseDeltaScales[0];
        let expression: number = +tone.expression;
        const expressionDelta: number = +tone.expressionDelta;
        let noiseSample: number = +tone.noiseSample;

        const filters: DynamicBiquadFilter[] = tone.noteFilters;
        const filterCount: number = tone.noteFilterCount | 0;
        let initialFilterInput1: number = +tone.initialNoteFilterInput1;
        let initialFilterInput2: number = +tone.initialNoteFilterInput2;
        const applyFilters: Function = Synth.applyFilters;

        let phase: number = (tone.phases[0] % 1) * Config.spectrumNoiseLength;
        // Zero phase means the tone was reset, just give noise a random start phase instead.
        if (tone.phases[0] == 0) phase = Synth.findRandomZeroCrossing(wave, Config.spectrumNoiseLength) + phaseDelta;
        const phaseMask: number = Config.spectrumNoiseLength - 1;

        // This is for a "legacy" style simplified 1st order lowpass filter with
        // a cutoff frequency that is relative to the tone's fundamental frequency.
        const pitchRelativefilter: number = Math.min(1.0, phaseDelta);

        const stopIndex: number = bufferIndex + runLength;
        for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
            const phaseInt: number = phase | 0;
            const index: number = phaseInt & phaseMask;
            let waveSample: number = wave[index];
            const phaseRatio: number = phase - phaseInt;
            waveSample += (wave[index + 1] - waveSample) * phaseRatio;

            noiseSample += (waveSample - noiseSample) * pitchRelativefilter;


            const inputSample: number = noiseSample;
            const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
            initialFilterInput2 = initialFilterInput1;
            initialFilterInput1 = inputSample;

            phase += phaseDelta;
            phaseDelta *= phaseDeltaScale;

            const output: number = sample * expression;
            expression += expressionDelta;

            data[sampleIndex] += output;
        }

        tone.phases[0] = phase / Config.spectrumNoiseLength;
        tone.phaseDeltas[0] = phaseDelta / samplesInPeriod;
        tone.expression = expression;
        tone.noiseSample = noiseSample;

        synth.sanitizeFilters(filters);
        tone.initialNoteFilterInput1 = initialFilterInput1;
        tone.initialNoteFilterInput2 = initialFilterInput2;
    }

    private static drumsetSynth(synth: Synth, bufferIndex: number, runLength: number, tone: Tone, instrumentState: InstrumentState): void {
        const data: Float32Array = synth.tempMonoInstrumentSampleBuffer!;
        let wave: Float32Array = instrumentState.getDrumsetWave(tone.drumsetPitch!);
        const referenceDelta: number = InstrumentState.drumsetIndexReferenceDelta(tone.drumsetPitch!);
        let phaseDelta: number = tone.phaseDeltas[0] / referenceDelta;
        const phaseDeltaScale: number = +tone.phaseDeltaScales[0];
        let expression: number = +tone.expression;
        const expressionDelta: number = +tone.expressionDelta;

        const filters: DynamicBiquadFilter[] = tone.noteFilters;
        const filterCount: number = tone.noteFilterCount | 0;
        let initialFilterInput1: number = +tone.initialNoteFilterInput1;
        let initialFilterInput2: number = +tone.initialNoteFilterInput2;
        const applyFilters: Function = Synth.applyFilters;

        let phase: number = (tone.phases[0] % 1) * Config.spectrumNoiseLength;
        // Zero phase means the tone was reset, just give noise a random start phase instead.
        if (tone.phases[0] == 0) phase = Synth.findRandomZeroCrossing(wave, Config.spectrumNoiseLength) + phaseDelta;
        const phaseMask: number = Config.spectrumNoiseLength - 1;

        const stopIndex: number = bufferIndex + runLength;
        for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
            const phaseInt: number = phase | 0;
            const index: number = phaseInt & phaseMask;
            let noiseSample: number = wave[index];
            const phaseRatio: number = phase - phaseInt;
            noiseSample += (wave[index + 1] - noiseSample) * phaseRatio;

            const inputSample: number = noiseSample;
            const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
            initialFilterInput2 = initialFilterInput1;
            initialFilterInput1 = inputSample;

            phase += phaseDelta;
            phaseDelta *= phaseDeltaScale;

            const output: number = sample * expression;
            expression += expressionDelta;

            data[sampleIndex] += output;
        }

        tone.phases[0] = phase / Config.spectrumNoiseLength;
        tone.phaseDeltas[0] = phaseDelta * referenceDelta;
        tone.expression = expression;

        synth.sanitizeFilters(filters);
        tone.initialNoteFilterInput1 = initialFilterInput1;
        tone.initialNoteFilterInput2 = initialFilterInput2;
    }

    private static modSynth(synth: Synth, stereoBufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrument: Instrument): void {
        // Note: present modulator value is tone.expressionStarts[0].

        if (!synth.song) return;

        let mod: number = Config.modCount - 1 - tone.pitches[0];

        // Flagged as invalid because unused by current settings, skip
        if (instrument.invalidModulators[mod]) return;

        let setting: number = instrument.modulators[mod];

        // Generate list of used instruments
        let usedInstruments: number[] = [];
        if (Config.modulators[instrument.modulators[mod]].forSong) {
            // Instrument doesn't matter for song, just push a random index to run the modsynth once
            usedInstruments.push(0);
        } else {
            // All
            if (instrument.modInstruments[mod] == synth.song.channels[instrument.modChannels[mod]].instruments.length) {
                for (let i: number = 0; i < synth.song.channels[instrument.modChannels[mod]].instruments.length; i++) {
                    usedInstruments.push(i);
                }
            }
            // Active
            else if (instrument.modInstruments[mod] > synth.song.channels[instrument.modChannels[mod]].instruments.length) {
                if (synth.song.getPattern(instrument.modChannels[mod], synth.bar) != null)
                    usedInstruments = synth.song.getPattern(instrument.modChannels[mod], synth.bar)!.instruments;
            } else {
                usedInstruments.push(instrument.modInstruments[mod]);
            }
        }

        for (let instrumentIndex: number = 0; instrumentIndex < usedInstruments.length; instrumentIndex++) {

            synth.setModValue(tone.expression, tone.expression + tone.expressionDelta, mod, instrument.modChannels[mod], usedInstruments[instrumentIndex], setting);
            for (const held of synth.heldMods) {
                if (held.setting == setting && (Config.modulators[setting].forSong || (held.channelIndex == instrument.modChannels[mod] && held.instrumentIndex == usedInstruments[instrumentIndex]))) {
                    synth.setModValue(held.volume, held.volume, mod, instrument.modChannels[mod], usedInstruments[instrumentIndex], setting);
                }
            }

            // Reset arps, but only at the start of the note
            if (setting == Config.modulators.dictionary["reset arp"].index && synth.tick == 0 && tone.noteStartPart == synth.beat * Config.partsPerBeat + synth.part) {
                synth.song.channels[instrument.modChannels[mod]].instruments[usedInstruments[instrumentIndex]].arpTime = 0;
            }
            // Denote next bar skip
            else if (setting == Config.modulators.dictionary["next bar"].index) {
                synth.wantToSkip = true;
            }
            // Extra info for eq filter target needs to be set as well
            else if (setting == Config.modulators.dictionary["eq filter"].index) {
                const tgtInstrument = synth.song.channels[instrument.modChannels[mod]].instruments[usedInstruments[instrumentIndex]];

                if (!tgtInstrument.eqFilterType) {

                    let dotTarget = instrument.modFilterTypes[mod] | 0;

                    if (dotTarget == 0) { // Morph. Figure out the target filter's X/Y coords for this point. If no point exists with this index, or point types don't match, do lerp-out for this point and lerp-in of a new point

                        let pinIdx: number = 0;
                        const currentPart: number = synth.getTicksIntoBar() / Config.ticksPerPart;
                        while (tone.note!.start + tone.note!.pins[pinIdx].time <= currentPart) pinIdx++;
                        // 0 to 1 based on distance to next morph
                        //let lerpStartRatio: number = (currentPart - tone.note!.pins[pinIdx - 1].time) / (tone.note!.pins[pinIdx].time - tone.note!.pins[pinIdx - 1].time);
                        let lerpEndRatio: number = ((currentPart - tone.note!.start + (roundedSamplesPerTick / (synth.getSamplesPerTick() * Config.ticksPerPart)) * Config.ticksPerPart) - tone.note!.pins[pinIdx - 1].time) / (tone.note!.pins[pinIdx].time - tone.note!.pins[pinIdx - 1].time);

                        // Compute the new settings to go to.
                        if (tgtInstrument.eqSubFilters[tone.note!.pins[pinIdx - 1].size] != null || tgtInstrument.eqSubFilters[tone.note!.pins[pinIdx].size] != null) {
                            tgtInstrument.tmpEqFilterEnd = FilterSettings.lerpFilters(tgtInstrument.eqSubFilters[tone.note!.pins[pinIdx - 1].size]!, tgtInstrument.eqSubFilters[tone.note!.pins[pinIdx].size]!, lerpEndRatio);
                        } else {
                            // No mutation will occur to the filter object so we can safely return it without copying
                            tgtInstrument.tmpEqFilterEnd = tgtInstrument.eqFilter;
                        }

                    } // Target (1 is dot 1 X, 2 is dot 1 Y, etc.)
                    else {
                        // Since we are directly manipulating the filter, make sure it is a new one and not an actual one of the instrument's filters
                        for (let i: number = 0; i < Config.filterMorphCount; i++) {
                            if (tgtInstrument.tmpEqFilterEnd == tgtInstrument.eqSubFilters[i] && tgtInstrument.tmpEqFilterEnd != null) {
                                tgtInstrument.tmpEqFilterEnd = new FilterSettings();
                                tgtInstrument.tmpEqFilterEnd.fromJsonObject(tgtInstrument.eqSubFilters[i]!.toJsonObject());
                            }
                        }
                        if (tgtInstrument.tmpEqFilterEnd == null) {
                            tgtInstrument.tmpEqFilterEnd = new FilterSettings();
                            tgtInstrument.tmpEqFilterEnd.fromJsonObject(tgtInstrument.eqFilter.toJsonObject());
                        }

                        if (tgtInstrument.tmpEqFilterEnd.controlPointCount > Math.floor((dotTarget - 1) / 2)) {
                            if (dotTarget % 2) { // X
                                tgtInstrument.tmpEqFilterEnd.controlPoints[Math.floor((dotTarget - 1) / 2)].freq = tone.expression + tone.expressionDelta;
                            } else { // Y
                                tgtInstrument.tmpEqFilterEnd.controlPoints[Math.floor((dotTarget - 1) / 2)].gain = tone.expression + tone.expressionDelta;
                            }
                        }
                    }
                }
            }
            // Extra info for note filter target needs to be set as well
            else if (setting == Config.modulators.dictionary["note filter"].index) {
                const tgtInstrument = synth.song.channels[instrument.modChannels[mod]].instruments[usedInstruments[instrumentIndex]];

                if (!tgtInstrument.noteFilterType) {
                    let dotTarget = instrument.modFilterTypes[mod] | 0;

                    if (dotTarget == 0) { // Morph. Figure out the target filter's X/Y coords for this point. If no point exists with this index, or point types don't match, do lerp-out for this point and lerp-in of a new point

                        let pinIdx: number = 0;
                        const currentPart: number = synth.getTicksIntoBar() / Config.ticksPerPart;
                        while (tone.note!.start + tone.note!.pins[pinIdx].time <= currentPart) pinIdx++;
                        // 0 to 1 based on distance to next morph
                        //let lerpStartRatio: number = (currentPart - tone.note!.pins[pinIdx - 1].time) / (tone.note!.pins[pinIdx].time - tone.note!.pins[pinIdx - 1].time);
                        let lerpEndRatio: number = ((currentPart - tone.note!.start + (roundedSamplesPerTick / (synth.getSamplesPerTick() * Config.ticksPerPart)) * Config.ticksPerPart) - tone.note!.pins[pinIdx - 1].time) / (tone.note!.pins[pinIdx].time - tone.note!.pins[pinIdx - 1].time);

                        // Compute the new settings to go to.
                        if (tgtInstrument.noteSubFilters[tone.note!.pins[pinIdx - 1].size] != null || tgtInstrument.noteSubFilters[tone.note!.pins[pinIdx].size] != null) {
                            tgtInstrument.tmpNoteFilterEnd = FilterSettings.lerpFilters(tgtInstrument.noteSubFilters[tone.note!.pins[pinIdx - 1].size]!, tgtInstrument.noteSubFilters[tone.note!.pins[pinIdx].size]!, lerpEndRatio);
                        } else {
                            // No mutation will occur to the filter object so we can safely return it without copying
                            tgtInstrument.tmpNoteFilterEnd = tgtInstrument.noteFilter;
                        }

                    } // Target (1 is dot 1 X, 2 is dot 1 Y, etc.)
                    else {
                        // Since we are directly manipulating the filter, make sure it is a new one and not an actual one of the instrument's filters

                        for (let i: number = 0; i < Config.filterMorphCount; i++) {
                            if (tgtInstrument.tmpNoteFilterEnd == tgtInstrument.noteSubFilters[i] && tgtInstrument.tmpNoteFilterEnd != null) {
                                tgtInstrument.tmpNoteFilterEnd = new FilterSettings();
                                tgtInstrument.tmpNoteFilterEnd.fromJsonObject(tgtInstrument.noteSubFilters[i]!.toJsonObject());
                            }
                        }
                        if (tgtInstrument.tmpNoteFilterEnd == null) {
                            tgtInstrument.tmpNoteFilterEnd = new FilterSettings();
                            tgtInstrument.tmpNoteFilterEnd.fromJsonObject(tgtInstrument.noteFilter.toJsonObject());
                        }

                        if (tgtInstrument.tmpNoteFilterEnd.controlPointCount > Math.floor((dotTarget - 1) / 2)) {
                            if (dotTarget % 2) { // X
                                tgtInstrument.tmpNoteFilterEnd.controlPoints[Math.floor((dotTarget - 1) / 2)].freq = tone.expression + tone.expressionDelta;
                            } else { // Y
                                tgtInstrument.tmpNoteFilterEnd.controlPoints[Math.floor((dotTarget - 1) / 2)].gain = tone.expression + tone.expressionDelta;
                            }
                        }
                    }
                }
            }
        }
    }

    private static findRandomZeroCrossing(wave: Float32Array, waveLength: number): number {
        let phase: number = Math.random() * waveLength;
        const phaseMask: number = waveLength - 1;

        // Spectrum and drumset waves sounds best when they start at a zero crossing,
        // otherwise they pop. Try to find a zero crossing.
        let indexPrev: number = phase & phaseMask;
        let wavePrev: number = wave[indexPrev];
        const stride: number = 16;
        for (let attemptsRemaining: number = 128; attemptsRemaining > 0; attemptsRemaining--) {
            const indexNext: number = (indexPrev + stride) & phaseMask;
            const waveNext: number = wave[indexNext];
            if (wavePrev * waveNext <= 0.0) {
                // Found a zero crossing! Now let's narrow it down to two adjacent sample indices.
                for (let i: number = 0; i < stride; i++) {
                    const innerIndexNext: number = (indexPrev + 1) & phaseMask;
                    const innerWaveNext: number = wave[innerIndexNext];
                    if (wavePrev * innerWaveNext <= 0.0) {
                        // Found the zero crossing again! Now let's find the exact intersection.
                        const slope: number = innerWaveNext - wavePrev;
                        phase = indexPrev;
                        if (Math.abs(slope) > 0.00000001) {
                            phase += -wavePrev / slope;
                        }
                        phase = Math.max(0, phase) % waveLength;
                        break;
                    } else {
                        indexPrev = innerIndexNext;
                        wavePrev = innerWaveNext;
                    }
                }
                break;
            } else {
                indexPrev = indexNext;
                wavePrev = waveNext;
            }
        }

        return phase;
    }

    public static instrumentVolumeToVolumeMult(instrumentVolume: number): number {
        return (instrumentVolume == -Config.volumeRange / 2.0) ? 0.0 : Math.pow(2, Config.volumeLogScale * instrumentVolume);
    }
    public static volumeMultToInstrumentVolume(volumeMult: number): number {
        return (volumeMult <= 0.0) ? -Config.volumeRange / 2 : Math.min(Config.volumeRange, (Math.log(volumeMult) / Math.LN2) / Config.volumeLogScale);
    }
    public static noteSizeToVolumeMult(size: number): number {
        return Math.pow(Math.max(0.0, size) / Config.noteSizeMax, 1.5);
    }
    public static volumeMultToNoteSize(volumeMult: number): number {
        return Math.pow(Math.max(0.0, volumeMult), 1 / 1.5) * Config.noteSizeMax;
    }

    public static fadeInSettingToSeconds(setting: number): number {
        return 0.0125 * (0.95 * setting + 0.05 * setting * setting);
    }
    public static secondsToFadeInSetting(seconds: number): number {
        return clamp(0, Config.fadeInRange, Math.round((-0.95 + Math.sqrt(0.9025 + 0.2 * seconds / 0.0125)) / 0.1));
    }
    public static fadeOutSettingToTicks(setting: number): number {
        return Config.fadeOutTicks[setting];
    }
    public static ticksToFadeOutSetting(ticks: number): number {
        let lower: number = Config.fadeOutTicks[0];
        if (ticks <= lower) return 0;
        for (let i: number = 1; i < Config.fadeOutTicks.length; i++) {
            let upper: number = Config.fadeOutTicks[i];
            if (ticks <= upper) return (ticks < (lower + upper) / 2) ? i - 1 : i;
            lower = upper;
        }
        return Config.fadeOutTicks.length - 1;
    }

    public static detuneToCents(detune: number): number {
        // BeepBox formula, for reference:
        // return detune * (Math.abs(detune) + 1) / 2;
        return detune - Config.detuneCenter;
    }
    public static centsToDetune(cents: number): number {
        // BeepBox formula, for reference:
        // return Math.sign(cents) * (Math.sqrt(1 + 8 * Math.abs(cents)) - 1) / 2.0;
        return cents + Config.detuneCenter;
    }

    public static getOperatorWave(waveform: number, pulseWidth: number) {
        if (waveform != 2) {
            return Config.operatorWaves[waveform];
        }
        else {
            return Config.pwmOperatorWaves[pulseWidth];
        }
    }

    private getSamplesPerTick(): number {
        if (this.song == null) return 0;
        let beatsPerMinute: number = this.song.getBeatsPerMinute();
        if (this.isModActive(Config.modulators.dictionary["tempo"].index)) {
            beatsPerMinute = this.getModValue(Config.modulators.dictionary["tempo"].index);
        }
        return this.getSamplesPerTickSpecificBPM(beatsPerMinute);
    }

    private getSamplesPerTickSpecificBPM(beatsPerMinute: number): number {
        const beatsPerSecond: number = beatsPerMinute / 60.0;
        const partsPerSecond: number = Config.partsPerBeat * beatsPerSecond;
        const tickPerSecond: number = Config.ticksPerPart * partsPerSecond;
        return this.samplesPerSecond / tickPerSecond;
    }

    public static fittingPowerOfTwo(x: number): number {
        return 1 << (32 - Math.clz32(Math.ceil(x) - 1));
    }

    private sanitizeFilters(filters: DynamicBiquadFilter[]): void {
        let reset: boolean = false;
        for (const filter of filters) {
            const output1: number = Math.abs(filter.output1);
            const output2: number = Math.abs(filter.output2);
            // If either is a large value, Infinity, or NaN, then just reset all filter history.
            if (!(output1 < 100) || !(output2 < 100)) {
                reset = true;
                break;
            }
            if (output1 < epsilon) filter.output1 = 0.0;
            if (output2 < epsilon) filter.output2 = 0.0;
        }
        if (reset) {
            for (const filter of filters) {
                filter.output1 = 0.0;
                filter.output2 = 0.0;
            }
        }
    }

    public static sanitizeDelayLine(delayLine: Float32Array, lastIndex: number, mask: number): void {
        while (true) {
            lastIndex--;
            const index: number = lastIndex & mask;
            const sample: number = Math.abs(delayLine[index]);
            if (Number.isFinite(sample) && (sample == 0.0 || sample >= epsilon)) break;
            delayLine[index] = 0.0;
        }
    }

    public static applyFilters(sample: number, input1: number, input2: number, filterCount: number, filters: DynamicBiquadFilter[]): number {
        for (let i: number = 0; i < filterCount; i++) {
            const filter: DynamicBiquadFilter = filters[i];
            const output1: number = filter.output1;
            const output2: number = filter.output2;
            const a1: number = filter.a1;
            const a2: number = filter.a2;
            const b0: number = filter.b0;
            const b1: number = filter.b1;
            const b2: number = filter.b2;
            sample = b0 * sample + b1 * input1 + b2 * input2 - a1 * output1 - a2 * output2;
            filter.a1 = a1 + filter.a1Delta;
            filter.a2 = a2 + filter.a2Delta;
            if (filter.useMultiplicativeInputCoefficients) {
                filter.b0 = b0 * filter.b0Delta;
                filter.b1 = b1 * filter.b1Delta;
                filter.b2 = b2 * filter.b2Delta;
            } else {
                filter.b0 = b0 + filter.b0Delta;
                filter.b1 = b1 + filter.b1Delta;
                filter.b2 = b2 + filter.b2Delta;
            }
            filter.output2 = output1;
            filter.output1 = sample;
            // Updating the input values is waste if the next filter doesn't exist...
            input2 = output2;
            input1 = output1;
        }
        return sample;
    }
}

// When compiling synth.ts as a standalone module named "beepbox", expose these classes as members to JavaScript:
export { Dictionary, DictionaryArray, FilterType, EnvelopeType, InstrumentType, Transition, Chord, Envelope, Config };
