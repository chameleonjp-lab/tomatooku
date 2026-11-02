import assert from 'node:assert/strict';
import fs from 'node:fs';
const values=new Map(), listeners=new Map(), voices=[], gains=[];
let constructed=0, resumed=0;
class Param { setValueAtTime(){} exponentialRampToValueAtTime(v){this.peak=Math.max(this.peak||0,v);} }
class Osc { constructor(){this.frequency=new Param();voices.push(this);} connect(){} start(){this.started=true;} stop(){this.stopped=true;} disconnect(){this.disconnected=true;} }
class Gain { constructor(){this.gain=new Param();gains.push(this);} connect(){} disconnect(){this.disconnected=true;} }
class Context { constructor(){constructed++;this.currentTime=1;this.state='running';this.destination={};} createOscillator(){return new Osc();} createGain(){return new Gain();} resume(){resumed++;return Promise.reject(Error('resume denied'));} }
globalThis.AudioContext=Context;
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
globalThis.document={hidden:false,addEventListener:(n,cb)=>listeners.set(n,cb)};
let id=0;const fresh=()=>import(`../src/sound.js?lifecycle=${++id}`);
const sound=await fresh();
assert.equal(typeof sound.getSoundVolume,'function','persistent volume API required');
assert.equal(sound.getSoundVolume(),1,'preserve existing low-gain sound level');
sound.setSoundEnabled(false);assert.equal(constructed,0,'first mute does not unlock');
sound.setSoundVolume(0);assert.equal(constructed,0);sound.setSoundEnabled(true);assert.equal(constructed,0,'volume zero never unlocks');
assert.equal(sound.playCorrectSound(),false);assert.equal(values.get(sound.SOUND_VOLUME_STORAGE_KEY),'0');
assert.equal((await fresh()).getSoundVolume(),0,'saved zero survives reload');
values.set(sound.SOUND_STORAGE_KEY,'false');assert.equal((await fresh()).isSoundEnabled(),false,'old off survives new volume');
sound.setSoundVolume(.5);sound.setSoundEnabled(true);assert.equal(sound.playCorrectSound(),true);
assert.ok(gains.some(g=>Math.abs(g.gain.peak-.016)<1e-9),'original tone gains scaled rather than replaced');
const first=[...voices];sound.setSoundEnabled(false);assert.ok(first.every(v=>v.stopped&&v.disconnected),'mute stops scheduled tones');assert.ok(gains.every(g=>g.disconnected));
sound.setSoundEnabled(true);sound.playIncorrectSound();const last=voices.at(-1);last.onended();assert.equal(last.disconnected,true,'ended releases source');
// New module clears throttle while preserving settings, allowing a visibility lifecycle check.
const visible=await fresh();visible.playCorrectSound();const active=voices.slice(-2);document.hidden=true;listeners.get('visibilitychange')();assert.ok(active.every(v=>v.stopped&&v.disconnected));
const count=voices.length;assert.equal(visible.playIncorrectSound(),false);document.hidden=false;listeners.get('visibilitychange')();assert.equal(voices.length,count,'return does not flush old sounds');
visible.setSoundVolume(0);assert.equal(visible.getSoundVolume(),0);assert.equal(visible.playIncorrectSound(),false);
assert.equal(visible.setSoundVolume(NaN),0,'invalid slider input cannot unmute');
values.set(sound.SOUND_VOLUME_STORAGE_KEY,'not-a-number');assert.equal((await fresh()).getSoundVolume(),1);
// A long burst remains bounded; production node releases are observable.
sound.setSoundEnabled(false);values.set(sound.SOUND_STORAGE_KEY,'true');values.set(sound.SOUND_VOLUME_STORAGE_KEY,'1');
const burst=await fresh(), realNow=Date.now;let clock=realNow();Date.now=()=>clock;
const offset=voices.length;
for(let i=0;i<100;i++){clock+=100;burst.playCorrectSound();assert.ok(voices.slice(offset).filter(v=>!v.disconnected).length<=8);}
burst.setSoundVolume(0);assert.ok(voices.slice(offset).every(v=>v.disconnected));Date.now=realNow;
// Partial allocation/start failures must also release allocated nodes.
class Broken extends Context {createOscillator(){const v=super.createOscillator();v.start=()=>{throw Error('start failed')};return v;}}
globalThis.AudioContext=Broken;values.set(sound.SOUND_VOLUME_STORAGE_KEY,'1');const broken=await fresh();const beforeBroken=voices.length;assert.equal(broken.playCorrectSound(),false);assert.ok(voices.slice(beforeBroken).every(v=>v.disconnected));
globalThis.AudioContext=Context;
globalThis.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('quota')}};const denied=await fresh();assert.equal(denied.getSoundVolume(),1);denied.setSoundVolume(.25);assert.equal(denied.getSoundVolume(),.25);
class Suspended extends Context {constructor(){super();this.state='suspended';}}
globalThis.AudioContext=Suspended;const suspended=await fresh();assert.equal(suspended.playCorrectSound(),false,'failed resume does not queue future audio');await Promise.resolve();assert.ok(resumed>0);
const html=fs.readFileSync('index.html','utf8'), main=fs.readFileSync('src/main.js','utf8');assert.match(html,/id="sound-volume"/);assert.match(main,/#sound-volume[\s\S]*addEventListener\("input"/);
console.log('✓ Audio: default/saved off/zero, volume, initial mute, cleanup, hidden return and resume failure');

// iOS Safari interruption is not a running context; never enqueue old cues.
class Interrupted extends Context {constructor(){super();this.state='interrupted';}}
globalThis.AudioContext=Interrupted;const interrupted=await fresh(), beforeInterrupted=voices.length;
assert.equal(interrupted.playCorrectSound(),false);await Promise.resolve();
assert.equal(voices.length,beforeInterrupted,'interrupted audio never queues voices');
// Interruption after scheduling must also release future tones.
let liveContext;
class Changing extends Context {constructor(){super();liveContext=this;} addEventListener(n,cb){this.listener=cb;}}
globalThis.AudioContext=Changing;const changing=await fresh();changing.playCorrectSound();
const beforeChange=voices.slice(-2);liveContext.state='interrupted';liveContext.listener();
assert.ok(beforeChange.every(v=>v.disconnected),'state interruption releases pending tones');
liveContext.state='running';liveContext.listener();
assert.ok(beforeChange.every(v=>v.disconnected),'state restoration does not revive old cues');
console.log('✓ Interrupted audio never queues or revives old cues');
