// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

/**
 * A meter is a list of visible columns. Each column has an independent note
 * value, while groupEnds marks the columns that begin a new visual group.
 * Durations use the editor's existing parts-per-quarter-note timebase.
 */
export type MeterMode = "common" | "compound";
export type NoteDenominator = 1 | 2 | 4 | 8 | 16 | 32;
export type NoteDots = 0 | 1 | 2;

export interface MeterColumn {
    denominator: NoteDenominator;
    dots: NoteDots;
}

export interface MeterProfile {
    mode: MeterMode;
    columns: MeterColumn[];
    /** Exclusive column indices at which visual groups end. */
    groupEnds: number[];
}

export interface MeterPreset {
    id: string;
    label: string;
    mode: MeterMode;
    /** A group is expressed as a count of denominator-note columns. */
    denominator: NoteDenominator;
    groups: number[];
}

export const meterPresets: ReadonlyArray<MeterPreset> = [
    { id: "2-4", label: "2/4", mode: "common", denominator: 4, groups: [2] },
    { id: "3-4", label: "3/4", mode: "common", denominator: 4, groups: [3] },
    { id: "4-4", label: "4/4", mode: "common", denominator: 4, groups: [4] },
    { id: "5-4-32", label: "5/4 (3+2)", mode: "common", denominator: 4, groups: [3, 2] },
    { id: "5-4-23", label: "5/4 (2+3)", mode: "common", denominator: 4, groups: [2, 3] },
    { id: "7-4-43", label: "7/4 (4+3)", mode: "common", denominator: 4, groups: [4, 3] },
    { id: "7-4-34", label: "7/4 (3+4)", mode: "common", denominator: 4, groups: [3, 4] },
    { id: "6-8", label: "6/8 (3+3)", mode: "compound", denominator: 8, groups: [3, 3] },
    { id: "7-8-223", label: "7/8 (2+2+3)", mode: "compound", denominator: 8, groups: [2, 2, 3] },
    { id: "7-8-232", label: "7/8 (2+3+2)", mode: "compound", denominator: 8, groups: [2, 3, 2] },
    { id: "7-8-322", label: "7/8 (3+2+2)", mode: "compound", denominator: 8, groups: [3, 2, 2] },
    { id: "9-8-333", label: "9/8 (3+3+3)", mode: "compound", denominator: 8, groups: [3, 3, 3] },
    { id: "9-8-2223", label: "9/8 (2+2+2+3)", mode: "compound", denominator: 8, groups: [2, 2, 2, 3] },
    { id: "9-8-2232", label: "9/8 (2+2+3+2)", mode: "compound", denominator: 8, groups: [2, 2, 3, 2] },
    { id: "9-8-2322", label: "9/8 (2+3+2+2)", mode: "compound", denominator: 8, groups: [2, 3, 2, 2] },
    { id: "9-8-3222", label: "9/8 (3+2+2+2)", mode: "compound", denominator: 8, groups: [3, 2, 2, 2] },
    { id: "10-8-3322", label: "10/8 (3+3+2+2)", mode: "compound", denominator: 8, groups: [3, 3, 2, 2] },
    { id: "10-8-3232", label: "10/8 (3+2+3+2)", mode: "compound", denominator: 8, groups: [3, 2, 3, 2] },
    { id: "10-8-3223", label: "10/8 (3+2+2+3)", mode: "compound", denominator: 8, groups: [3, 2, 2, 3] },
    { id: "10-8-2332", label: "10/8 (2+3+3+2)", mode: "compound", denominator: 8, groups: [2, 3, 3, 2] },
    { id: "10-8-2323", label: "10/8 (2+3+2+3)", mode: "compound", denominator: 8, groups: [2, 3, 2, 3] },
    { id: "10-8-2233", label: "10/8 (2+2+3+3)", mode: "compound", denominator: 8, groups: [2, 2, 3, 3] },
    { id: "11-8-3332", label: "11/8 (3+3+3+2)", mode: "compound", denominator: 8, groups: [3, 3, 3, 2] },
    { id: "11-8-3323", label: "11/8 (3+3+2+3)", mode: "compound", denominator: 8, groups: [3, 3, 2, 3] },
    { id: "11-8-3233", label: "11/8 (3+2+3+3)", mode: "compound", denominator: 8, groups: [3, 2, 3, 3] },
    { id: "11-8-2333", label: "11/8 (2+3+3+3)", mode: "compound", denominator: 8, groups: [2, 3, 3, 3] },
    { id: "12-8", label: "12/8 (3+3+3+3)", mode: "compound", denominator: 8, groups: [3, 3, 3, 3] },
];

const _partsPerQuarter: number = 24;

/** Convert a dotted note value to the editor's current part timebase. */
export function meterColumnDurationParts(column: MeterColumn): number {
    const baseDuration: number = _partsPerQuarter * 4 / column.denominator;
    return baseDuration * (column.dots == 0 ? 1 : column.dots == 1 ? 1.5 : 1.75);
}

export function meterDurationParts(profile: MeterProfile): number {
    return profile.columns.reduce((total, column) => total + meterColumnDurationParts(column), 0);
}

export function meterColumnStartParts(profile: MeterProfile, columnIndex: number): number {
    const end: number = Math.max(0, Math.min(profile.columns.length, Math.floor(columnIndex)));
    let parts: number = 0;
    for (let index: number = 0; index < end; index++) parts += meterColumnDurationParts(profile.columns[index]);
    return parts;
}

export function meterGroupBoundaryParts(profile: MeterProfile): number[] {
    return profile.groupEnds
        .filter(end => Number.isInteger(end) && end > 0 && end < profile.columns.length)
        .sort((a, b) => a - b)
        .filter((end, index, ends) => index == 0 || end != ends[index - 1])
        .map(end => meterColumnStartParts(profile, end));
}

export function createMeterPreset(preset: MeterPreset): MeterProfile {
    const columns: MeterColumn[] = [];
    const groupEnds: number[] = [];
    for (const groupSize of preset.groups) {
        if (!Number.isInteger(groupSize) || groupSize < 1) throw new Error("Meter preset groups must be positive integers.");
        for (let index: number = 0; index < groupSize; index++) {
            columns.push({ denominator: preset.denominator, dots: 0 });
        }
        groupEnds.push(columns.length);
    }
    // The final group end is the bar end, not an internal visual divider.
    groupEnds.pop();
    return { mode: preset.mode, columns, groupEnds };
}

/**
 * Return a validated copy suitable for loading from a file or URL. The editor
 * supports 1/32 notes exactly at 24 parts per quarter note; finer values would
 * require changing the underlying timebase.
 */
export function normalizeMeterProfile(value: unknown): MeterProfile | null {
    if (!value || typeof value != "object") return null;
    const candidate: any = value;
    if (candidate.mode != "common" && candidate.mode != "compound") return null;
    if (!Array.isArray(candidate.columns) || candidate.columns.length < 1 || candidate.columns.length > 64) return null;
    const columns: MeterColumn[] = [];
    for (const column of candidate.columns) {
        if (!column || ![1, 2, 4, 8, 16, 32].includes(column.denominator) || ![0, 1, 2].includes(column.dots)) return null;
        columns.push({ denominator: column.denominator, dots: column.dots });
    }
    if (!Array.isArray(candidate.groupEnds) || candidate.groupEnds.length > columns.length - 1) return null;
    const groupEnds: number[] = [];
    for (const end of candidate.groupEnds) {
        if (!Number.isInteger(end) || end <= 0 || end >= columns.length) return null;
        groupEnds.push(end);
    }
    groupEnds.sort((a, b) => a - b);
    if (groupEnds.some((end, index) => index > 0 && end == groupEnds[index - 1])) return null;
    const profile: MeterProfile = { mode: candidate.mode, columns, groupEnds };
    if (columns.some(column => !Number.isInteger(meterColumnDurationParts(column)))) return null;
    const duration: number = meterDurationParts(profile);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(duration)) return null;
    return profile;
}
