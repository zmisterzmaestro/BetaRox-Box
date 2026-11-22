// Experimental, non-destructive conversion from GoldBox note data to MusicXML.
// Standard 12-TET pitches, one notated part per pitched channel.
// Each editor beat becomes a quarter (simple) or dotted quarter (compound).
import {Song} from "../synth/synth";
import {meterSignature} from "../synth/Meter";

const spellings: [string,number][] = [["C",0],["C",1],["D",0],["D",1],["E",0],["F",0],["F",1],["G",0],["G",1],["A",0],["A",1],["B",0]];
function esc(value: unknown): string {
    const entities: {[key:string]:string} = {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"};
    return String(value ?? "").replace(/[&<>"']/g, char => entities[char]);
}
function pitchXml(midi: number): string {
    const [step,alter] = spellings[((midi % 12)+12)%12];
    return "<pitch><step>"+step+"</step>"+(alter?"<alter>"+alter+"</alter>":"")+"<octave>"+(Math.floor(midi/12)-1)+"</octave></pitch>";
}
function durationType(length: number, compound: boolean, fine: boolean): string {
    if (fine && !compound) return length===8?"<type>quarter</type>":length===6?"<type>eighth</type><dot/>":length===4?"<type>eighth</type>":length===3?"<type>16th</type><dot/>":length===2?"<type>16th</type>":"<type>32nd</type>";
    if (compound) return length===3?"<type>quarter</type><dot/>":length===2?"<type>quarter</type>":"<type>eighth</type>";
    return length===4?"<type>quarter</type>":length===3?"<type>eighth</type><dot/>":length===2?"<type>eighth</type>":"<type>16th</type>";
}
type Span = {start:number,end:number,pitches:number[]};

export function makeMusicXml(song: Song, compound: boolean, intro: boolean, loops: number, outro: boolean, fine: boolean = false): string {
    if (song.pitchesPerOctave!==12) throw new Error("MusicXML export currently supports twelve-note tuning only.");
    const data:any = song.toJsonObject(intro,loops,outro);
    const profile=song.meterProfile;
    const signature=profile?meterSignature(profile):null;
    const unit=profile?8:compound?3:fine?8:4, divisions=profile?8:compound?2:unit, beats=song.beatsPerBar, capacity=Math.round(beats*unit);
    const base=song.keys[song.key].basePitch;
    const channels:any[]=data.channels.filter((c:any)=>c.type==="pitch" && c.sequence.some((n:number)=>n>0 && c.patterns[n-1]?.notes.some((note:any)=>note.pitches.length>0)));
    if (!channels.length) throw new Error("There are no pitched notes to notate.");
    const quantize=(tick:number):number=>Math.max(0,Math.min(capacity,Math.round(tick*unit/data.ticksPerBeat)));
    let xml='<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>'+esc(song.title)+'</work-title></work><part-list>';
    channels.forEach((c,i)=>xml+='<score-part id="P'+(i+1)+'"><part-name>'+esc(c.name||("Track "+(i+1)))+'</part-name></score-part>');
    xml+='</part-list>';
    channels.forEach((c,i)=>{
        xml+='<part id="P'+(i+1)+'">';
        const allPitches:number[]=[];
        for(const pattern of c.patterns) for(const note of pattern.notes) for(const pitch of note.pitches) allPitches.push(pitch+base);
        const avg=allPitches.reduce((a,b)=>a+b,0)/Math.max(1,allPitches.length);
        const clef=avg<60?'<sign>F</sign><line>4</line>':'<sign>G</sign><line>2</line>';
        c.sequence.forEach((patternNumber:number, bar:number)=>{
            xml+='<measure number="'+(bar+1)+'">';
            if(bar===0){
                xml+='<attributes><divisions>'+divisions+'</divisions><time><beats>'+(signature?signature.numerator:compound?beats*3:beats)+'</beats><beat-type>'+(signature?signature.denominator:compound?8:4)+'</beat-type></time><clef>'+clef+'</clef></attributes>';
                xml+='<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>'+(!profile&&compound?'<beat-unit-dot/>':'')+'<per-minute>'+song.tempo+'</per-minute></metronome></direction-type><sound tempo="'+(song.tempo*(!profile&&compound?1.5:1))+'"/></direction>';
            }
            const notes:any[]=patternNumber>0?c.patterns[patternNumber-1]?.notes||[]:[];
            const spans:Span[]=notes.filter(n=>n.points?.length>=2&&n.pitches?.length).map(n=>{
                const start=quantize(n.points[0].tick);
                const end=Math.min(capacity,Math.max(start+1,quantize(n.points[n.points.length-1].tick)));
                return {start,end,pitches:[...new Set<number>(n.pitches.map((p:number)=>p+base))]};
            }).filter(n=>n.start<n.end).sort((a,b)=>a.start-b.start||a.end-b.end);
            let cursor=0;
            const write=(start:number,end:number,pitches:number[]):void=>{
                let t=start;
                while(t<end){
                    let stop=Math.min(end,(Math.floor(t/unit)+1)*unit);
                    if((fine&&!compound)||profile){const remaining=stop-t;const allowed=[8,6,4,3,2,1];const length=allowed.find(n=>n<=remaining)!;stop=t+length;}
                    const len=stop-t, tieStop=pitches.length>0&&t>start,tieStart=pitches.length>0&&stop<end;
                    const ties=(tieStop?'<tie type="stop"/>':'')+(tieStart?'<tie type="start"/>':'');
                    const notation=(tieStop||tieStart)?'<notations>'+(tieStop?'<tied type="stop"/>':'')+(tieStart?'<tied type="start"/>':'')+'</notations>':'';
                    (pitches.length?pitches:[-1]).forEach((p,j)=>{
                        xml+='<note>'+(j?'<chord/>':'')+(p<0?'<rest/>':pitchXml(p))+'<duration>'+len+'</duration>'+ties+'<voice>1</voice>'+durationType(len,profile?false:compound,profile?true:fine)+notation+'</note>';
                    });
                    t=stop;
                }
            };
            for(let j=0;j<spans.length;j++){
                const n=spans[j],start=Math.max(cursor,n.start),end=Math.min(n.end,spans[j+1]?.start??capacity);
                if(end<=start)continue;
                if(start>cursor)write(cursor,start,[]);
                write(start,end,n.pitches);cursor=end;
            }
            if(cursor<capacity)write(cursor,capacity,[]);
            xml+='</measure>';
        });
        xml+='</part>';
    });
    return xml+'</score-partwise>';
}
