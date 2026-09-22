/* Short hero clips: preload once, decode once, play from memory after a user gesture. */
(() => {
  'use strict';
  class HeroVoicePlayer {
    constructor(onStatus) {
      this.onStatus=onStatus;this.buffers=new Map();this.loading=new Map();this.media=new Map();
      this.context=null;this.source=null;this.activeMedia=null;this.volume=.45;this.token=0;
      const Context=window.AudioContext||window.webkitAudioContext;
      if(location.protocol!=='file:'&&Context){try{this.context=new Context({latencyHint:'interactive'});this.gain=this.context.createGain();this.gain.connect(this.context.destination);}catch{}}
    }
    setVolume(value){this.volume=value;if(this.gain)this.gain.gain.value=value;if(this.activeMedia)this.activeMedia.volume=value;}
    status(value){this.onStatus?.(value);}
    stop(){this.token++;if(this.source){try{this.source.stop();}catch{}this.source=null;}if(this.activeMedia){this.activeMedia.pause();this.activeMedia=null;}this.status('');}
    async load(file){
      if(this.buffers.has(file))return this.buffers.get(file);
      if(this.loading.has(file))return this.loading.get(file);
      if(!this.context){let media=this.media.get(file);if(!media){media=new Audio('assets/'+file);media.preload='auto';media.load();this.media.set(file,media);}return media;}
      const job=(async()=>{
        const url=new URL('assets/'+file,location.href).href;let cache,response;
        try{if('caches' in window){cache=await caches.open('hulan-hero-audio-v1');response=await cache.match(url);}}catch{}
        if(!response){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('Audio unavailable');const bytes=await response.arrayBuffer();if(cache)cache.put(url,new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}})).catch(()=>{});const buffer=await this.context.decodeAudioData(bytes);this.buffers.set(file,buffer);return buffer;}finally{clearTimeout(timer);}}
        const buffer=await this.context.decodeAudioData(await response.arrayBuffer());this.buffers.set(file,buffer);return buffer;
      })();
      this.loading.set(file,job);try{return await job;}finally{this.loading.delete(file);}
    }
    warm(hero){return Promise.allSettled(Object.values(hero.voiceRoles).map(clip=>this.load(clip.file)));}
    async warmAll(heroes){
      // Three small requests at a time leave bandwidth for the first screen's images.
      const files=heroes.flatMap(h=>Object.values(h.voiceRoles).map(c=>c.file));
      for(let i=0;i<files.length;i+=3)await Promise.allSettled(files.slice(i,i+3).map(file=>this.load(file)));
    }
    async play(file){
      this.stop();const token=this.token;
      const ready=this.buffers.has(file);if(!ready)this.status('语音准备中…');
      try{
        // Resume synchronously in the click handler and immediately observe both promises.
        const resumed=this.context?this.context.resume():Promise.resolve();
        if(!this.context){const media=await this.load(file);if(token!==this.token)return false;this.activeMedia=media;media.currentTime=0;media.volume=this.volume;await media.play();if(token!==this.token){media.pause();return false;}media.onended=()=>{if(token===this.token)this.status('');};}
        else{const [buffer]=await Promise.all([this.load(file),resumed]);if(token!==this.token)return false;const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.gain);this.gain.gain.value=this.volume;this.source=source;source.onended=()=>{if(token===this.token){this.source=null;this.status('');}};source.start();}
        this.status('正在播放语音');return true;
      }catch(error){if(token!==this.token)return false;this.status('语音未就绪，可点重听');throw error;}
    }
  }
  window.HeroVoicePlayer=HeroVoicePlayer;
})();
