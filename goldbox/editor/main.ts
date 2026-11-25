// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { Dictionary, DictionaryArray, EnvelopeType, InstrumentType, Transition, Chord, Envelope, Config } from "../synth/SynthConfig";
import { isMobile, EditorConfig } from "./EditorConfig";
import { ColorConfig } from "./ColorConfig";
import "./style"; // Import for the side effects, there's no exports.
import {SongEditor} from "./SongEditor";
import {NotePin, Note, Pattern, Instrument, Channel, Song, Synth} from "../synth/synth";
import {SongDocument} from "./SongDocument";
import {ExportPrompt} from "./ExportPrompt";
import {ChangeAddChannel, ChangePreset} from "./changes";


//namespace beepbox {
const doc: SongDocument = new SongDocument();//debug only
const editor: SongEditor = new SongEditor(doc);//same as above
// const doc: SongDocument = new SongDocument();
// const editor: SongEditor = new SongEditor(doc);
const beepboxEditorContainer: HTMLElement = document.getElementById("beepboxEditorContainer")!;
beepboxEditorContainer.appendChild(editor.mainLayer);
editor.whenUpdated();

const labLink = document.querySelector<HTMLAnchorElement>("#betarox-player-link");
if (labLink) {
	const syncLabLink = (): void => {
		const destination = new URL("/editor/player/", location.href);
		destination.search = location.search;
		labLink.href = doc.song.toCompatibleUrl(destination.href);
	};
	// Serialize on interaction so edits are included even when the address bar hides the song.
	syncLabLink();
	for (const event of ["focus", "pointerdown", "contextmenu", "click"]) {
		labLink.addEventListener(event, syncLabLink);
	}
	labLink.target = "_blank";
	labLink.rel = "opener";
}

// Spectral Lab sends only an instrument preset. Its example notes and song-wide
// settings are deliberately excluded so the current song remains intact.
window.addEventListener("message", (event: MessageEvent): void => {
	if (event.origin !== location.origin || event.data?.type !== "betarox:spectral-instrument" || event.data?.target !== "editor") return;
	const reply = (message: string, ok: boolean): void => {
		if (event.source && "postMessage" in event.source) {
			(event.source as Window).postMessage({ type: "betarox:spectral-import-status", message, ok }, event.origin);
		}
	};
	try {
		const rawInstrument = event.data.instrument;
		if (!rawInstrument || typeof rawInstrument !== "object" || rawInstrument.type !== "harmonics" || !Array.isArray(rawInstrument.harmonics)) {
			throw new Error("This is not a supported BetaRox spectral instrument.");
		}
		if (doc.song.pitchChannelCount >= Config.pitchChannelCountMax) {
			reply("No channel was added. This song already has the maximum of " + Config.pitchChannelCountMax + " pitch channels.", false);
			return;
		}
		// Parse and validate before changing the song, so malformed input cannot
		// leave a partially added channel behind.
		const importedInstrument = new Instrument(false, false);
		importedInstrument.fromJsonObject(rawInstrument, false, false, doc.song.rhythm == 0 || doc.song.rhythm == 2, doc.song.rhythm >= 2);
		const channelName = String(event.data.name || "Spectral Instrument").trim().slice(0, Channel.nameLengthMax) || "Spectral Instrument";
		const newChannelIndex = doc.song.pitchChannelCount;
		doc.record(new ChangeAddChannel(doc, newChannelIndex, false, false));
		const newChannel = doc.song.channels[newChannelIndex];
		newChannel.instruments[0] = importedInstrument;
		newChannel.name = channelName;
		doc.channel = newChannelIndex;
		doc.viewedInstrument[newChannelIndex] = 0;
		doc.notifier.changed();
		reply("Imported “" + channelName + "” into a new channel. Existing channels and notes were preserved.", true);
	} catch (error) {
		const detail = error instanceof Error ? error.message : "The instrument could not be read.";
		reply("Import failed; the song was left unchanged. " + detail, false);
	}
});

// A standalone Spectral Lab can open a fresh editor song with its preset attached.
const spectralPreset = new URLSearchParams(location.search).get("spectralPreset");
if (spectralPreset) {
    try {
        const value = JSON.parse(spectralPreset);
        const rawInstrument = value.instrument;
        if (!rawInstrument || rawInstrument.type !== "harmonics" || !Array.isArray(rawInstrument.harmonics)) throw new Error("Unsupported spectral instrument.");
        const importedInstrument = new Instrument(false, false);
        importedInstrument.fromJsonObject(rawInstrument, false, false, false, false);
        if (doc.song.pitchChannelCount >= Config.pitchChannelCountMax) throw new Error("No pitch channel is available for this instrument.");
        const newChannelIndex = doc.song.pitchChannelCount;
        doc.record(new ChangeAddChannel(doc, newChannelIndex, false, false));
        doc.song.channels[newChannelIndex].instruments[0] = importedInstrument;
        doc.song.channels[newChannelIndex].name = String(value.name || "Spectral Instrument").slice(0, Channel.nameLengthMax);
        doc.channel = newChannelIndex;
        doc.viewedInstrument[newChannelIndex] = 0;
        doc.notifier.changed();
        const cleanUrl = new URL(location.href); cleanUrl.searchParams.delete("spectralPreset"); history.replaceState(history.state, "", cleanUrl.href);
    } catch (error) { window.alert(error instanceof Error ? error.message : "Could not load the spectral preset."); }
}

// Fade-in transitions
editor.mainLayer.className += " load";
editor.mainLayer.getElementsByClassName("pattern-area")[0].className += " load";
editor.mainLayer.getElementsByClassName("settings-area")[0].className += " load";
editor.mainLayer.getElementsByClassName("editor-song-settings")[0].className += " load";
editor.mainLayer.getElementsByClassName("instrument-settings-area")[0].className += " load";
editor.mainLayer.getElementsByClassName("trackAndMuteContainer")[0].className += " load";
editor.mainLayer.getElementsByClassName("barScrollBar")[0].className += " load";

// Give select2 class to these
$('#pitchPresetSelect').select2({ dropdownAutoWidth: true });
$('#drumPresetSelect').select2({ dropdownAutoWidth: true });

// Onclick event to expand/collapse optgroups
$("body").on('click', '.select2-container--open .select2-results__group', function () {
	$(this).siblings().toggle();
});

// Open event to collapse all optgroups by default
$("#pitchPresetSelect").on('select2:open', function () {
	$('.select2-dropdown--below').css('opacity', 0);
	$('.select2-dropdown').css('opacity', 1);
	$('#pitchPresetSelect')
	setTimeout(() => {
		let groups = $('.select2-container--open .select2-results__group');
		let options = $('.select2-container--open .select2-results__option');

		$.each(groups, (index, v) => {
			$(v).siblings().hide();
			$(v)[0].setAttribute("style", "color: " + ColorConfig.getChannelColor(doc.song, doc.channel).primaryNote + ";");
		})
		$.each(options, (index, v) => {
			$(v)[0].setAttribute("style", "color: " + ColorConfig.getChannelColor(doc.song, doc.channel).primaryNote + ";");
		})

		$('.select2-dropdown--below').css('opacity', 1);
	}, 0);
});

// Open event to collapse all optgroups by default
$("#drumPresetSelect").on('select2:open', function () {
	$('.select2-dropdown--below').css('opacity', 0);
	$('.select2-dropdown').css('opacity', 1);
	$('#drumPresetSelect')
	setTimeout(() => {
		let groups = $('.select2-container--open .select2-results__group');
		let options = $('.select2-container--open .select2-results__option');

		$.each(groups, (index, v) => {
			$(v).siblings().hide();
			$(v)[0].setAttribute("style", "color: " + ColorConfig.getChannelColor(doc.song, doc.channel).primaryNote + ";");
		})
		$.each(options, (index, v) => {
			$(v)[0].setAttribute("style", "color: " + ColorConfig.getChannelColor(doc.song, doc.channel).primaryNote + ";");
		})

		$('.select2-dropdown--below').css('opacity', 1);
	}, 0);
});

// Select2 events
// The latter is to ensure select2 doesn't keep focus after the select2 is closed without making a selection.
$('#pitchPresetSelect').on("change", editor._whenSetPitchedPreset);
$('#pitchPresetSelect').on("select2:close", editor._refocus);

$('#drumPresetSelect').on("change", editor._whenSetDrumPreset);
$('#drumPresetSelect').on("select2:close", editor._refocus);


editor.mainLayer.focus();

// don't autoplay on mobile devices, wait for input.
if (!isMobile && doc.prefs.autoPlay) {
	function autoplay(): void {
		if (!document.hidden) {
			doc.synth.play();
			editor.updatePlayButton();
			window.removeEventListener("visibilitychange", autoplay);
		}
	}
	if (document.hidden) {
		// Wait until the tab is visible to autoplay:
		window.addEventListener("visibilitychange", autoplay);
	} else {
		autoplay();
	}
}

// BeepBox uses browser history state as its own undo history. Browsers typically
// remember scroll position for each history state, but BeepBox users would prefer not 
// auto scrolling when undoing. Sadly this tweak doesn't work on Edge or IE.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

editor.updatePlayButton();

if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("/service_worker.js", {updateViaCache: "all", scope: "/"}).catch(() => {});
}

// When compiling synth.ts as a standalone module named "beepbox", expose these classes as members to JavaScript:
	export {Dictionary, DictionaryArray, EnvelopeType, InstrumentType, Transition, Chord, Envelope, Config, NotePin, Note, Pattern, Instrument, Channel, Song, Synth, ColorConfig, EditorConfig, SongDocument, SongEditor, ExportPrompt, ChangePreset};
