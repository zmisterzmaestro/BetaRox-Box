// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {InstrumentType, Config, Envelope, EnvelopeType} from "../synth/SynthConfig";
import {Instrument} from "../synth/synth";
import {SongDocument} from "./SongDocument";
import {ChangeSetEnvelopeTarget, ChangeSetEnvelopeType, ChangeRemoveEnvelope} from "./changes";
import {HTML} from "imperative-html/dist/esm/elements-strict";

// These readouts describe the preset factors applied by EnvelopeComputer.
function describeShape(shape: Envelope): string {
	const speed = shape.speed;
	const speeds = Config.envelopes.filter(other => other.type === shape.type).map(other => other.speed);
	const choices = Array.from(new Set(speeds)).sort((a, b) => a - b).join(", ");
	switch (shape.type) {
		case EnvelopeType.none: return "Constant level at 100%.";
		case EnvelopeType.noteSize: return "Follows note size (0–" + Config.noteSizeMax + "). Output 0–100%.";
		case EnvelopeType.punch: return "Falls from 200% to 100% in 0.1 seconds, then holds.";
		case EnvelopeType.tremolo:
		case EnvelopeType.tremolo2:
			return speed + " cycles per beat (choices: " + choices + "). Output " + (shape.type === EnvelopeType.tremolo2 ? "50" : "0") + "–100%.";
		case EnvelopeType.linear:
		case EnvelopeType.rise:
			return (shape.type === EnvelopeType.rise ? "Rises from 0% to 100%" : "Falls from 100% to 0%") + " in " + (16 / speed) + " s. Speed " + speed + " (choices: " + choices + ").";
		case EnvelopeType.decay:
			return "Halves every " + (1 / speed).toFixed(3) + " s. Speed " + speed + " (choices: " + choices + "). Output 0–100%.";
		default:
			return "Speed " + speed + " (choices: " + choices + "). Output 0–100%.";
	}
}

export class EnvelopeEditor {
	private readonly _defaultRouting = HTML.div({class: "envelopeReadout"}, "Note size controls note volume by default.");
	public readonly container: HTMLElement = HTML.div({class: "envelopeEditor"}, this._defaultRouting);
	private readonly _readouts: HTMLElement[] = [];
	
	private readonly _rows: HTMLDivElement[] = [];
	private readonly _targetSelects: HTMLSelectElement[] = [];
	private readonly _envelopeSelects: HTMLSelectElement[] = [];
	private readonly _deleteButtons: HTMLButtonElement[] = [];
	private _renderedEnvelopeCount: number = 0;
	private _renderedEqFilterCount: number = -1;
	private _renderedNoteFilterCount: number = -1;
	private _renderedInstrumentType: InstrumentType;
	private _renderedEffects: number = 0;
	
	constructor(private _doc: SongDocument) {
		this.container.addEventListener("change", this._onChange);
		this.container.addEventListener("click", this._onClick);
	}
	
	private _onChange = (event: Event): void => {
		const targetSelectIndex: number = this._targetSelects.indexOf(<any> event.target);
		const envelopeSelectIndex: number = this._envelopeSelects.indexOf(<any> event.target);
		if (targetSelectIndex != -1) {
			const combinedValue: number = parseInt(this._targetSelects[targetSelectIndex].value);
			const target: number = combinedValue % Config.instrumentAutomationTargets.length;
			const index: number = (combinedValue / Config.instrumentAutomationTargets.length) >>> 0;
			this._doc.record(new ChangeSetEnvelopeTarget(this._doc, targetSelectIndex, target, index));
		} else if (envelopeSelectIndex != -1) {
			this._doc.record(new ChangeSetEnvelopeType(this._doc, envelopeSelectIndex, this._envelopeSelects[envelopeSelectIndex].selectedIndex));
		}
	}
	
	private _onClick = (event: MouseEvent): void => {
		const index: number = this._deleteButtons.indexOf(<any> event.target);
		if (index != -1) {
			this._doc.record(new ChangeRemoveEnvelope(this._doc, index));
		}
	}
	
	private _makeOption(target: number, index: number): HTMLOptionElement {
		let displayName = Config.instrumentAutomationTargets[target].displayName;
		if (Config.instrumentAutomationTargets[target].maxCount > 1) {
			if (displayName.indexOf("#") != -1) {
				displayName = displayName.replace("#", String(index+1));
			} else {
				displayName += " " + (index+1);
			}
		}
		return HTML.option({value: target + index * Config.instrumentAutomationTargets.length}, displayName);
	}
	
	private _updateTargetOptionVisibility(menu: HTMLSelectElement, instrument: Instrument): void {
		for (let optionIndex: number = 0; optionIndex < menu.childElementCount; optionIndex++) {
			const option: HTMLOptionElement = <HTMLOptionElement> menu.children[optionIndex];
			const combinedValue: number = parseInt(option.value);
			const target: number = combinedValue % Config.instrumentAutomationTargets.length;
			const index: number = (combinedValue / Config.instrumentAutomationTargets.length) >>> 0;
			option.hidden = !instrument.supportsEnvelopeTarget(target, index);
		}
	}
	
	public render(): void {
		const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
		
		for (let envelopeIndex: number = this._rows.length; envelopeIndex < instrument.envelopeCount; envelopeIndex++) {
			const targetSelect: HTMLSelectElement = HTML.select({ "aria-label": "Envelope target " + (envelopeIndex + 1) });
			for (let target: number = 0; target < Config.instrumentAutomationTargets.length; target++) {
				const interleaved: boolean = (Config.instrumentAutomationTargets[target].interleave);
				for (let index: number = 0; index < Config.instrumentAutomationTargets[target].maxCount; index++) {
					targetSelect.appendChild(this._makeOption(target, index));
					if (interleaved) {
						targetSelect.appendChild(this._makeOption(target + 1, index));
					}
				}
				if (interleaved) target++;
			}
			
			const envelopeSelect: HTMLSelectElement = HTML.select({ "aria-label": "Envelope shape " + (envelopeIndex + 1) });
			for (let envelope: number = 0; envelope < Config.envelopes.length; envelope++) {
				envelopeSelect.appendChild(HTML.option({value: envelope}, Config.envelopes[envelope].name));
			} 
			
			const deleteButton: HTMLButtonElement = HTML.button({type: "button", class: "delete-envelope"});
			
			const row: HTMLDivElement = HTML.div({class: "envelope-row"},
				HTML.div({class: "selectContainer", style: "width: 0; flex: 1;"}, targetSelect),
				HTML.div({class: "selectContainer", style: "width: 0; flex: 0.7;"}, envelopeSelect),
				deleteButton,
			);
			
			const readout = HTML.div({class: "envelopeReadout"});
			this._readouts.push(readout);
			this.container.appendChild(row);
			this.container.appendChild(readout);
			this._rows[envelopeIndex] = row;
			this._targetSelects[envelopeIndex] = targetSelect;
			this._envelopeSelects[envelopeIndex] = envelopeSelect;
			this._deleteButtons[envelopeIndex] = deleteButton;
		}
		
		for (let envelopeIndex: number = this._renderedEnvelopeCount; envelopeIndex < instrument.envelopeCount; envelopeIndex++) {
			this._rows[envelopeIndex].style.display = "";
			this._readouts[envelopeIndex].hidden = false;
			// For newly visible rows, update target option visibiliy.
			this._updateTargetOptionVisibility(this._targetSelects[envelopeIndex], instrument);
		}
		
		for (let envelopeIndex: number = instrument.envelopeCount; envelopeIndex < this._renderedEnvelopeCount; envelopeIndex++) {
			this._rows[envelopeIndex].style.display = "none";
			this._readouts[envelopeIndex].hidden = true;
		}

		let useControlPointCount: number = instrument.noteFilter.controlPointCount;
		if (instrument.noteFilterType)
			useControlPointCount = 1;
		
		if (this._renderedEqFilterCount != instrument.eqFilter.controlPointCount ||
			this._renderedNoteFilterCount != useControlPointCount ||
			this._renderedInstrumentType != instrument.type ||
			this._renderedEffects != instrument.effects)
		{
			// Update target option visibility for previously visible rows.
			for (let envelopeIndex: number = 0; envelopeIndex < this._renderedEnvelopeCount; envelopeIndex++) {
				this._updateTargetOptionVisibility(this._targetSelects[envelopeIndex], instrument);
			}
		}
		
		for (let envelopeIndex: number = 0; envelopeIndex < instrument.envelopeCount; envelopeIndex++) {
			this._targetSelects[envelopeIndex].value = String(instrument.envelopes[envelopeIndex].target + instrument.envelopes[envelopeIndex].index * Config.instrumentAutomationTargets.length);
			const shapeIndex = instrument.envelopes[envelopeIndex].envelope;
			this._envelopeSelects[envelopeIndex].selectedIndex = shapeIndex;
			if (this._readouts[envelopeIndex].dataset.shape !== String(shapeIndex)) {
				this._readouts[envelopeIndex].textContent = describeShape(Config.envelopes[shapeIndex]);
				this._readouts[envelopeIndex].dataset.shape = String(shapeIndex);
			}
		}
		
		this._defaultRouting.hidden = instrument.envelopes.slice(0, instrument.envelopeCount).some(setting => Config.envelopes[setting.envelope].type === EnvelopeType.noteSize);
		this._renderedEnvelopeCount = instrument.envelopeCount;
		this._renderedEqFilterCount = instrument.eqFilter.controlPointCount;
		this._renderedNoteFilterCount = useControlPointCount;
		this._renderedInstrumentType = instrument.type;
		this._renderedEffects = instrument.effects;
	}
}
