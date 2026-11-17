// Copyright (c) John Nesky and contributing authors, distributed under the MIT license.

import { HTML } from "imperative-html/dist/esm/elements-strict";
import { Channel } from "../synth/synth";
import { Config } from "../synth/SynthConfig";
import { ChangeChannelName } from "./changes";
import { SongDocument } from "./SongDocument";

export class ChannelNameEditor {
	public readonly container = HTML.div({ class: "channelLabels", style: "padding-top: " + Config.barEditorHeight + "px" });
	private readonly _inputs: HTMLInputElement[] = [];
	private _editingChannel: Channel | null = null;

	constructor(private readonly _doc: SongDocument, private readonly _refocusStage: () => void) {}

	public focus(index: number): void {
		this._inputs[index].focus();
		this._inputs[index].select();
	}

	private _addInput(index: number): void {
		const input = HTML.input({ type: "text", maxlength: String(Channel.nameLengthMax), placeholder: "Channel name", autocomplete: "off", spellcheck: "false", "aria-label": "Name channel " + (index + 1) });
		input.addEventListener("mousedown", event => event.stopPropagation());
		input.addEventListener("focus", () => { this._editingChannel = this._doc.song.channels[index]; });
		input.addEventListener("blur", () => {
			const channel = this._doc.song.channels[index];
			if (channel && channel === this._editingChannel && channel.name !== input.value) {
				this._doc.record(new ChangeChannelName(this._doc, channel, input.value));
			}
			this._editingChannel = null;
			if (channel) input.value = channel.name;
		});
		input.addEventListener("keydown", event => {
			event.stopPropagation();
			if (event.isComposing || (event.key !== "Enter" && event.key !== "Escape")) return;
			event.preventDefault();
			if (event.key === "Escape" && this._editingChannel) input.value = this._editingChannel.name;
			this._refocusStage();
		});
		input.addEventListener("keyup", event => event.stopPropagation());
		this.container.appendChild(input);
		this._inputs.push(input);
	}

	public render(): void {
		const channels = this._doc.song.channels;
		while (this._inputs.length < channels.length) this._addInput(this._inputs.length);
		while (this._inputs.length > channels.length) this._inputs.pop()!.remove();
		this.container.style.setProperty("--channel-row-height", this._doc.getChannelHeight() + "px");
		for (let i = 0; i < channels.length; i++) {
			const input = this._inputs[i], channel = channels[i];
			if (document.activeElement === input && this._editingChannel !== channel) input.blur();
			if (document.activeElement !== input && input.value !== channel.name) input.value = channel.name;
			input.title = channel.name || "Click to name this channel";
		}
	}
}
