// Mono PCM16/24 kHz in bounded 40 ms frames. No per-sample work on the UI thread.
class KindredVoiceCapture extends AudioWorkletProcessor {
  constructor(){super();this.samples=new Int16Array(960);this.used=0;this.position=0;this.muted=false;this.port.onmessage=e=>{this.muted=e.data?.muted===true;};}
  process(inputs){
    const input=inputs[0]?.[0];if(!input)return true;
    const step=sampleRate/24000;
    for(;this.position<input.length;this.position+=step){
      const n=Math.min(input.length-1,Math.floor(this.position)),value=this.muted?0:Math.max(-1,Math.min(1,input[n]));
      this.samples[this.used++]=value<0?value*32768:value*32767;
      if(this.used===960){this.port.postMessage(this.samples.buffer,[this.samples.buffer]);this.samples=new Int16Array(960);this.used=0;}
    }
    this.position-=input.length;return true;
  }
}
registerProcessor('kindred-voice-capture',KindredVoiceCapture);
