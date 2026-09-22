const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const unhandled=[];process.on('unhandledRejection',e=>unhandled.push(e));
class Context {createGain(){return {gain:{},connect(){}};}resume(){return Promise.reject(new Error('Resume denied'));}}
const sandbox={window:{AudioContext:Context},location:{protocol:'https:'},Map,setTimeout};
vm.runInNewContext(fs.readFileSync(__dirname+'/dist/voice-player.js','utf8'),sandbox);
(async()=>{const player=new sandbox.window.HeroVoicePlayer();player.load=()=>new Promise(resolve=>setTimeout(()=>resolve({}),40));await assert.rejects(()=>player.play('test.mp3'),/Resume denied/);await new Promise(resolve=>setTimeout(resolve,80));assert.deepEqual(unhandled,[]);console.log('PASS: rejected audio resume is handled while decoding remains pending.');})().catch(e=>{console.error(e);process.exitCode=1;});
