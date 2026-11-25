// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { HTML } from "imperative-html/dist/esm/elements-strict";
import { ColorConfig } from "./ColorConfig";

export class Layout {
	private static readonly _layoutMap: {[K: string]: string} = {
		"small": "",
		"long": `\

			/* long layout */
			@media (min-width: 711px) {
				#beepboxEditorContainer {
					max-width: initial;
					height: 100vh;
				}
				.beepboxEditor {
					width: 100%;
					height: 100vh;
					grid-template-columns: minmax(0, 1fr) 390px; /* minmax(0, 1fr) min-content; Chrome 80 grid layout regression. https://bugs.chromium.org/p/chromium/issues/detail?id=1050307 */
					grid-template-rows: minmax(481px, 1fr) minmax(0, min-content);
					grid-template-areas: "pattern-area settings-area" "track-area track-area";
				}
				.beepboxEditor .pattern-area {
					width: 100%;
					height: 100%;
				}
				.beepboxEditor .track-area {
					width: 100%;
					display: flex;
					flex-direction: column;
				}
				.beepboxEditor .trackAndMuteContainer {
					width: 100%;
					min-height: 0;
					flex: 1;
					overflow: auto;
					max-height: 97.5vh;
				}
				.beepboxEditor .instrument-settings-area {
					overflow-y: auto;
					position: relative;
				}
				.beepboxEditor .instrument-settings-area > .editor-controls {
					position: absolute;
					width: 100%;
				}
				.beepboxEditor .song-settings-area {
					overflow-y: auto;
				}
				
				.beepboxEditor .settings-area {
					width: 390px;
					grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
					grid-template-rows: auto auto auto minmax(0, 1fr);
					grid-template-areas:
						"instrument-settings-area version-area"
						"instrument-settings-area play-pause-area"
						"instrument-settings-area menu-area"
						"instrument-settings-area song-settings-area";
				}
				
				.beepboxEditor .barScrollBar {
					display: none;
				}
				.beepboxEditor.selectRow {
					height: 2em;
				}
				.beepboxEditor .operatorRow {
					heiht: 2em;
				}
				.beepboxEditor .trackAndMuteContainer {
					max-height: 446px;
				}

				.beepboxEditor .trackContainer {
					overflow: visible;
				}
				.beepboxEditor .trackAndMuteContainer {
					scrollbar-width: auto;
					scrollbar-color: ${ColorConfig.uiWidgetBackground} ${ColorConfig.editorBackground};
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar {
					width: 20px;
					height: 20px;
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar-track {
					background: ${ColorConfig.editorBackground};
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar-thumb {
					background-color: ${ColorConfig.uiWidgetBackground};
					border: 3px solid ${ColorConfig.editorBackground};
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar-corner {
					background-color: ${ColorConfig.editorBackground};
				}
			}
		`,
		"tall": `\
			/* tall layout */
			@media (min-width: 711px) {
				#beepboxEditorContainer {
					max-width: initial;
					height: 100vh;
				}
				.beepboxEditor {
					width: 100%;
					height: 100vh;
					grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 192px;
					grid-template-rows: 1fr;
					grid-template-areas: "track-area pattern-area settings-area";
				}
				.beepboxEditor .pattern-area {
					width: 100%;
					height: 100%;
				}
				.beepboxEditor .track-area {
					width: 100%;
					height: 100%;
					display: flex;
					flex-direction: column;
					justify-content: center;
				}
				.beepboxEditor .trackAndMuteContainer {
					width: 100%;
					min-height: 0;
					flex: 0;
					overflow: auto;
					flex-basis: initial;
					flex-grow: 0;
					max-height: 97.5vh;
				}
				.beepboxEditor .instrument-settings-area > .editor-controls {
					position: absolute;
					width: 100%;
				}
				
				.beepboxEditor .settings-area {
					width: 192px;
					position: relative;
					overflow-y: auto;
					grid-template-columns: minmax(0, 1fr);
					grid-template-rows: auto auto auto auto minmax(0, 1fr);
					grid-template-areas:
						"version-area"
						"play-pause-area"
						"menu-area"
						"song-settings-area"
						"instrument-settings-area";
				}
				.beepboxEditor .version-area {
					position: sticky;
					top: 0;
					z-index: 1;
					background: ${ColorConfig.editorBackground};
				}
				.beepboxEditor .play-pause-area {
					position: sticky;
					top: 22px;
					z-index: 1;
					background: ${ColorConfig.editorBackground};
				}
				.beepboxEditor .menu-area {
					position: sticky;
					top: 82px;
					z-index: 1;
					background: ${ColorConfig.editorBackground};
				}
				
				.beepboxEditor .barScrollBar {
					display: none;
				}
				.beepboxEditor .trackContainer {
					overflow: visible;
				}
				.beepboxEditor .trackAndMuteContainer {
					scrollbar-width: auto;
					scrollbar-color: ${ColorConfig.uiWidgetBackground} ${ColorConfig.editorBackground};
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar {
					width: 20px;
					height: 20px;
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar-track {
					background: ${ColorConfig.editorBackground};
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar-thumb {
					background-color: ${ColorConfig.uiWidgetBackground};
					border: 3px solid ${ColorConfig.editorBackground};
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar-corner {
					background-color: ${ColorConfig.editorBackground};
				}
			}
		`,
		"wide": `\
			/* wide (JB) layout */
			@media (min-width: 1001px) {
				#beepboxEditorContainer {
					max-width: initial;
					height: 100vh;
				}
				.beepboxEditor {
					width: 100%;
					height: 100vh;
					grid-template-columns: 512px minmax(0, 1fr) 30em;
					grid-template-rows: minmax(481px, 1fr) min-content;
					grid-template-areas: "track-area pattern-area settings-area";
				}
				.beepboxEditor .pattern-area {
					width: 100%;
					height: 100%;
				}
				.beepboxEditor .track-area {
					width: 100%;
					height: 100%;
					max-height: 100%
				}
				.beepboxEditor .editor-widget-column {
					flex: 0;
				}
				.beepboxEditor .trackAndMuteContainer {
					width: 100%;
					flex: 0;
					flex-basis: initial;
					flex-grow: 0;
					overflow-y: auto;
					max-height: 97.5vh;
				}
				.beepboxEditor .instrument-settings-area {
					overflow-y: auto;
					position: relative;
				}
				.beepboxEditor .instrument-settings-area > .editor-controls {
					position: absolute;
					width: 100%;
				}
				
				.beepboxEditor .song-settings-area {
					overflow-y: auto;
				}
				
				.beepboxEditor .settings-area {
					width: 30em;
					grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
					grid-template-rows: auto auto auto minmax(0, 1fr);
					grid-template-areas:
						"instrument-settings-area version-area"
						"instrument-settings-area play-pause-area"
						"instrument-settings-area menu-area"
						"instrument-settings-area song-settings-area";
				}
				.beepboxEditor .version-area {
					position: sticky;
					top: 0;
					z-index: 1;
					background: ${ColorConfig.editorBackground};
				}
				.beepboxEditor .play-pause-area {
					position: sticky;
					top: 22px;
					z-index: 1;
					background: ${ColorConfig.editorBackground};
				}
				.beepboxEditor .menu-area {
					position: sticky;
					top: 82px;
					z-index: 1;
					background: ${ColorConfig.editorBackground};
				}
				
				.beepboxEditor .trackContainer {
					overflow: visible;
				}
			}
		`,
		"long-br": `\
			/* Long (BR) layout: song controls and channel labels left, editor center, instrument controls right. */
			@media (min-width: 0px) {
				#beepboxEditorContainer {
					box-sizing: border-box;
					width: 100%;
					min-width: 0;
					max-width: initial;
					height: 100vh;
					overflow: auto;
				}
				.beepboxEditor {
					--br-side-panel-width: var(--settings-area-width);
					width: 100%;
					min-width: 1001px;
					height: 100vh;
					grid-template-columns: var(--br-side-panel-width) minmax(0, 1fr) var(--br-side-panel-width);
					grid-template-rows: auto auto auto minmax(0, 1fr) minmax(0, min(30vh, 320px));
					grid-template-areas:
						"version-area pattern-area instrument-settings-area"
						"play-pause-area pattern-area instrument-settings-area"
						"menu-area pattern-area instrument-settings-area"
						"song-settings-area pattern-area instrument-settings-area"
						"track-area track-area instrument-settings-area";
					grid-column-gap: 8px;
				}
				.beepboxEditor .settings-area {
					display: contents;
				}
				.beepboxEditor .version-area,
				.beepboxEditor .play-pause-area,
				.beepboxEditor .menu-area,
				.beepboxEditor .song-settings-area {
					min-width: 0;
					width: auto;
					box-sizing: border-box;
					padding-right: 10px;
					padding-left: 10px;
					border-right: 1px solid ${ColorConfig.uiWidgetBackground};
					border-left: 1px solid ${ColorConfig.uiWidgetBackground};
				}
				.beepboxEditor .version-area {
					border-top: 1px solid ${ColorConfig.uiWidgetBackground};
				}
				.beepboxEditor .song-settings-area {
					min-height: 0;
					overflow-y: auto;
					border-bottom: 1px solid ${ColorConfig.uiWidgetBackground};
				}
				.beepboxEditor .pattern-area {
					box-sizing: border-box;
					width: 100%;
					height: 100%;
					min-width: 0;
					/* The Long BR grid has a fixed bottom track row; let the pattern area shrink with short windows. */
					min-height: 0;
					padding: 8px;
					border: 1px solid ${ColorConfig.uiWidgetBackground};
				}
				.beepboxEditor .track-area {
					box-sizing: border-box;
					overflow: hidden;
					min-height: 0;
					width: 100%;
					min-width: 0;
					display: flex;
					flex-direction: column;
					position: relative;
					border-right: 1px solid ${ColorConfig.uiWidgetBackground};
					border-bottom: 1px solid ${ColorConfig.uiWidgetBackground};
					border-left: 1px solid ${ColorConfig.uiWidgetBackground};
				}
				.beepboxEditor .track-area::before {
					content: "";
					position: absolute;
					top: 0;
					bottom: 0;
					left: var(--br-side-panel-width);
					border-left: 1px solid ${ColorConfig.uiWidgetBackground};
					pointer-events: none;
				}
				.beepboxEditor .trackAndMuteContainer {
					width: 100%;
					min-width: 0;
					height: 0;
					min-height: 0;
					flex: 1 1 0%;
					overflow: auto;
					max-height: 97.5vh;
				}
				.beepboxEditor .trackControls {
					width: var(--br-side-panel-width);
					height: 100%;
					max-height: 100%;
					min-height: 0;
					flex: 0 0 var(--br-side-panel-width);
					box-sizing: border-box;
					overflow: hidden;
				}
				.beepboxEditor .channelLabels {
					width: calc(var(--br-side-panel-width) - 49px);
				}
				.beepboxEditor .trackContainer {
					min-width: 0;
					flex: 1;
					overflow: hidden;
				}
				.beepboxEditor .instrument-settings-area {
					box-sizing: border-box;
					min-width: 0;
					width: auto;
					position: relative;
					overflow-y: auto;
					padding: 8px;
					border: 1px solid ${ColorConfig.uiWidgetBackground};
				}
				.beepboxEditor .instrument-settings-area > .editor-controls {
					position: relative;
					width: 100%;
				}
				.beepboxEditor .instrument-settings-area .selectRow,
				.beepboxEditor .instrument-settings-area .instrumentCopyPasteRow {
					margin-top: 1px;
					margin-bottom: 1px;
				}
				.beepboxEditor .channelLabels input[type=text] {
					text-align: right;
				}
				@media (max-height: 700px) {
					.beepboxEditor .song-settings-area {
						--button-size: clamp(18px, 3.8vh, 26px);
						font-size: clamp(11px, 2.2vh, 13px);
						padding-right: 6px;
						padding-left: 6px;
					}
					.beepboxEditor .song-settings-area .selectRow,
					.beepboxEditor .song-settings-area .instrumentCopyPasteRow {
						margin-top: 1px;
						margin-bottom: 1px;
					}
				}
				.beepboxEditor .barScrollBar {
					display: none;
				}
				.beepboxEditor .trackAndMuteContainer {
					scrollbar-width: auto;
					scrollbar-color: ${ColorConfig.uiWidgetBackground} ${ColorConfig.editorBackground};
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar {
					width: 20px;
					height: 20px;
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar-track {
					background: ${ColorConfig.editorBackground};
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar-thumb {
					background-color: ${ColorConfig.uiWidgetBackground};
					border: 3px solid ${ColorConfig.editorBackground};
				}
				.beepboxEditor .trackAndMuteContainer::-webkit-scrollbar-corner {
					background-color: ${ColorConfig.editorBackground};
				}
			}
		`,
	}
		
		private static readonly _styleElement: HTMLStyleElement = document.head.appendChild(HTML.style({type: "text/css"}));
		
	public static setLayout(layout: string): void {
		this._styleElement.textContent = this._layoutMap[layout];
	}
}
