// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { HTML } from "imperative-html/dist/esm/elements-strict";
import { SongDocument } from "./SongDocument";
import { Prompt } from "./Prompt";
import { ChangeMeterProfile } from "./changes";
import { MeterColumn, MeterProfile, meterDurationParts, meterPresets, createMeterPreset, normalizeMeterProfile } from "../synth/Meter";

const { button, div, span, h2, input, select, option, label } = HTML;
const noteDenominators: number[] = [1, 2, 4, 8, 16, 32];
const noteLabels: { [key: number]: string } = { 1: "Whole", 2: "Half", 4: "Quarter", 8: "Eighth", 16: "16th", 32: "32nd" };

export class BeatsPerBarPrompt implements Prompt {
	private readonly _presetSelect: HTMLSelectElement = select({ style: "width: 100%;" },
		option({ value: "custom" }, "Custom meter"),
		...meterPresets.map(preset => option({ value: preset.id }, preset.label)),
	);
	private readonly _modeSelect: HTMLSelectElement = select({ style: "width: 100%;" },
		option({ value: "common" }, "Common meter"),
		option({ value: "compound" }, "Compound meter"),
	);
	private readonly _columnCount: HTMLInputElement = input({ type: "number", min: "1", max: "64", step: "1", style: "width: 4em;" });
	private readonly _columns: HTMLDivElement = div({ style: "display: flex; flex-direction: column; gap: .35em; max-height: 14em; overflow-y: auto;" });
	private readonly _preview: HTMLDivElement = div({ style: "font-size: smaller; margin: .5em 0;" });
	private readonly _conversionStrategySelect: HTMLSelectElement = select({ style: "width: 100%;" },
		option({ value: "splice" }, "Splice notes that extend past the new bar length."),
		option({ value: "stretch" }, "Stretch notes to fit the new bar length."),
		option({ value: "overflow" }, "Overflow notes into following bars."),
	);
	private readonly _cancelButton: HTMLButtonElement = button({ class: "cancelButton" });
	private readonly _okayButton: HTMLButtonElement = button({ class: "okayButton", style: "width:45%;" }, "Apply meter");
	private _profile: MeterProfile;
	private _columnEditors: Array<{ duration: HTMLSelectElement; dots: HTMLSelectElement; groupEnd: HTMLInputElement | null }> = [];

	public readonly container: HTMLDivElement = div({ class: "prompt noSelection", style: "width: min(440px, 90vw);" },
		h2("Meter and Grouping"),
		div("Start with a pattern, then adjust its columns and group breaks."),
		label({ style: "display: block; margin-top: .7em;" }, "Preset", this._presetSelect),
		label({ style: "display: block; margin-top: .5em;" }, "Interpretation", this._modeSelect),
		label({ style: "display: flex; align-items: center; justify-content: space-between; margin: .6em 0;" }, "Number of columns", this._columnCount),
		this._columns,
		this._preview,
		div({ class: "selectContainer", style: "width: 100%; margin: .5em 0;" }, this._conversionStrategySelect),
		div({ style: "display: flex; flex-direction: row-reverse; justify-content: space-between;" }, this._okayButton),
		this._cancelButton,
	);

	constructor(private _doc: SongDocument) {
		if (_doc.song.meterProfile) {
			this._profile = JSON.parse(JSON.stringify(_doc.song.meterProfile));
		} else {
			const beatCount: number = Math.max(1, Math.min(64, Math.round(_doc.song.beatsPerBar)));
			this._profile = {
				mode: "common",
				columns: Array.from({ length: beatCount }, () => ({ denominator: 4 as MeterColumn["denominator"], dots: 0 as MeterColumn["dots"] })),
				groupEnds: beatCount == 8 ? [4] : beatCount > 4 ? [Math.floor(beatCount / 2)] : [],
			};
		}
		this._modeSelect.value = this._profile.mode;
		this._columnCount.value = String(this._profile.columns.length);
		const lastStrategy: string | null = window.localStorage.getItem("beatCountStrategy");
		if (lastStrategy) this._conversionStrategySelect.value = lastStrategy;
		this._renderColumns();

		this._presetSelect.addEventListener("change", this._whenPresetChanged);
		this._modeSelect.addEventListener("change", this._whenModeChanged);
		this._columnCount.addEventListener("change", this._whenColumnCountChanged);
		this._okayButton.addEventListener("click", this._saveChanges);
		this._cancelButton.addEventListener("click", this._close);
	}

	public cleanUp = (): void => {
		this._presetSelect.removeEventListener("change", this._whenPresetChanged);
		this._modeSelect.removeEventListener("change", this._whenModeChanged);
		this._columnCount.removeEventListener("change", this._whenColumnCountChanged);
		this._okayButton.removeEventListener("click", this._saveChanges);
		this._cancelButton.removeEventListener("click", this._close);
	}

	private _close = (): void => { this._doc.undo(); }

	private _whenPresetChanged = (): void => {
		const preset = meterPresets.find(item => item.id == this._presetSelect.value);
		if (preset) {
			this._profile = createMeterPreset(preset);
			this._modeSelect.value = this._profile.mode;
			this._columnCount.value = String(this._profile.columns.length);
			this._renderColumns();
		}
	}

	private _whenModeChanged = (): void => {
		this._profile.mode = this._modeSelect.value as MeterProfile["mode"];
		this._presetSelect.value = "custom";
		this._updatePreview();
	}

	private _whenColumnCountChanged = (): void => {
		const count: number = Math.max(1, Math.min(64, Math.floor(Number(this._columnCount.value) || 1)));
		this._columnCount.value = String(count);
		const fallback: MeterColumn = this._profile.columns[0] || { denominator: 4, dots: 0 };
		while (this._profile.columns.length < count) this._profile.columns.push({ ...fallback });
		this._profile.columns.length = count;
		this._profile.groupEnds = this._profile.groupEnds.filter(end => end < count);
		this._presetSelect.value = "custom";
		this._renderColumns();
	}

	private _renderColumns(): void {
		while (this._columns.firstChild) this._columns.removeChild(this._columns.firstChild);
		this._columnEditors = [];
		this._profile.columns.forEach((column, index) => {
			const duration: HTMLSelectElement = select({ "aria-label": `Column ${index + 1} note value`, style: "min-width: 6.5em;" },
				...noteDenominators.map(denominator => option({ value: denominator }, noteLabels[denominator])),
			);
			duration.value = String(column.denominator);
			const dots: HTMLSelectElement = select({ "aria-label": `Column ${index + 1} dots`, style: "min-width: 6em;" },
				option({ value: 0 }, "Straight"), option({ value: 1 }, "Dotted"), option({ value: 2 }, "Double dotted"),
			);
			dots.value = String(column.dots);
			let groupEnd: HTMLInputElement | null = null;
			const row: HTMLDivElement = div({ style: "display: flex; align-items: center; gap: .4em;" },
				span({ style: "min-width: 5em;" }, `Column ${index + 1}`), duration, dots,
			);
			if (index < this._profile.columns.length - 1) {
				groupEnd = input({ type: "checkbox", "aria-label": `Group ends after column ${index + 1}` });
				groupEnd.checked = this._profile.groupEnds.includes(index + 1);
				row.appendChild(label({ style: "display: flex; align-items: center; gap: .2em;" }, groupEnd, "Group"));
			}
			duration.addEventListener("change", this._whenColumnValueChanged);
			dots.addEventListener("change", this._whenColumnValueChanged);
			groupEnd?.addEventListener("change", this._whenColumnValueChanged);
			this._columnEditors.push({ duration, dots, groupEnd });
			this._columns.appendChild(row);
		});
		this._updatePreview();
	}

	private _whenColumnValueChanged = (): void => {
		this._readColumns();
		this._presetSelect.value = "custom";
		this._updatePreview();
	}

	private _readColumns(): void {
		this._profile.columns = this._columnEditors.map(editor => ({
			denominator: Number(editor.duration.value) as MeterColumn["denominator"],
			dots: Number(editor.dots.value) as MeterColumn["dots"],
		}));
		this._profile.groupEnds = this._columnEditors
			.map((editor, index) => editor.groupEnd?.checked ? index + 1 : -1)
			.filter(end => end > 0);
	}

	private _updatePreview(): void {
		const columns = this._profile.columns.map((column, index) => {
			const dots = column.dots == 0 ? "" : column.dots == 1 ? "." : "..";
			return noteLabels[column.denominator] + dots + (this._profile.groupEnds.includes(index + 1) ? "  |  " : "  ");
		}).join("");
		const durationInParts: number = meterDurationParts(this._profile);
		const valid: MeterProfile | null = normalizeMeterProfile(this._profile);
		this._preview.textContent = `${columns}\nBar length: ${durationInParts / 24} quarter-note beats${valid && durationInParts / 24 >= 2 && durationInParts / 24 <= 16 ? "" : " — choose values between 2 and 16 quarter-note beats that fit the editor's timing grid."}`;
		this._okayButton.disabled = !valid || durationInParts / 24 < 2 || durationInParts / 24 > 16;
	}

	private _saveChanges = (): void => {
		this._readColumns();
		const profile: MeterProfile | null = normalizeMeterProfile(this._profile);
		if (!profile) return;
		window.localStorage.setItem("beatCountStrategy", this._conversionStrategySelect.value);
		this._doc.prompt = null;
		this._doc.record(new ChangeMeterProfile(this._doc, profile, this._conversionStrategySelect.value), true);
	}
}
