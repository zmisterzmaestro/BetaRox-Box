// Copyright (C) 2020 John Nesky, distributed under the MIT license.
// A few wrapper classes that add functionality onto existing HTML elements, namely binding some events to an implementation-specified change class

import { Change } from "./Change";
import { SongDocument } from "./SongDocument";
import { HTML } from "imperative-html/dist/esm/elements-strict";

const { span } = HTML;

export class InputBox {
	private _change: Change | null = null;
	private _value: string = "";
	private _oldValue: string = "";

	constructor(public readonly input: HTMLInputElement, private readonly _doc: SongDocument, private readonly _getChange: (oldValue: string, newValue: string) => Change) {
		input.addEventListener("input", this._whenInput);
		input.addEventListener("change", this._whenChange);
	}

	public updateValue(value: string): void {
		this._value = value;
		this.input.value = String(value);
	}

	private _whenInput = (): void => {
		const continuingProspectiveChange: boolean = this._doc.lastChangeWas(this._change);
		if (!continuingProspectiveChange) this._oldValue = this._value;
		this._change = this._getChange(this._oldValue, this.input.value);
		this._doc.setProspectiveChange(this._change);
	};

	private _whenChange = (): void => {
		this._doc.record(this._change!);
		this._change = null;
	};
}

export class Slider {
	public getValueBeforeProspectiveChange(): number { return this._oldValue; }
	private _change: Change | null = null;
	private _value: number = 0;
	private _oldValue: number = 0;
	public container: HTMLSpanElement;

	constructor(public readonly input: HTMLInputElement, private readonly _doc: SongDocument, private readonly _getChange: ((oldValue: number, newValue: number) => Change) | null, midTick: boolean) {
		// A container is created around the input to allow for spec-compliant pseudo css classes (e.g ::before and ::after, which must be added to containers, not the input itself)
		this.container = (midTick) ? span({ class: "midTick", style: "position: sticky; width: 61.5%;" }, input) : span({ style: "position: sticky;" }, input);
		input.addEventListener("input", this._whenInput);
		input.addEventListener("change", this._whenChange);
	}

	public updateValue(value: number): void {
		this._value = value;
		this.input.value = String(value);
	}

	private _whenInput = (): void => {
		const continuingProspectiveChange: boolean = this._doc.lastChangeWas(this._change);
		if (!continuingProspectiveChange) this._oldValue = this._value;
		if (this._getChange != null) {
			this._change = this._getChange(this._oldValue, parseInt(this.input.value));
			this._doc.setProspectiveChange(this._change);
		}
	};

	private _whenChange = (): void => {
		if (this._getChange != null) {
			this._doc.record(this._change!);
			this._change = null;
		}
	};
}


export class DoubleSlider {
 public readonly container: HTMLSpanElement;
 private readonly leftInput: HTMLInputElement;
 private readonly rightInput: HTMLInputElement;
 private readonly leftSlider: Slider;
 private readonly rightSlider: Slider;
 private _min: number;
 private _max: number;
 constructor(doc: SongDocument, getChangeLeft: ((oldValue:number,newValue:number)=>Change)|null, getChangeRight: ((oldValue:number,newValue:number)=>Change)|null, _getModLeft:()=>number|null, _getModRight:()=>number|null, left:number, right:number, min:number, max:number, _midTick: 0|1|2) {
  this._min=min; this._max=max;
  this.leftInput=HTML.input({type:"range",min,max,value:left,step:"1",style:"flex:1; min-width:0;"});
  this.rightInput=HTML.input({type:"range",min,max,value:right,step:"1",style:"flex:1; min-width:0;"});
  this.leftSlider=new Slider(this.leftInput,doc,getChangeLeft,false);
  this.rightSlider=new Slider(this.rightInput,doc,getChangeRight,false);
  this.container=HTML.span({style:"display:flex; align-items:center; gap:2px; flex:3;"},this.leftSlider.container,this.rightSlider.container);
 }
 set max(value:number){this._max=value;this.leftInput.max=String(value);this.rightInput.max=String(value);}
 get max():number{return this._max;}
 set min(value:number){this._min=value;this.leftInput.min=String(value);this.rightInput.min=String(value);}
 get min():number{return this._min;}
 updateValues(left:number,right:number):void{this.leftSlider.updateValue(left);this.rightSlider.updateValue(right);}
 render():void{}
}
