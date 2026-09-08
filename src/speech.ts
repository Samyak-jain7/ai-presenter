// Small local VAD on echo-cancelled microphone PCM. It stops playback without a network round trip.
// ponytail: energy detection can mistake loud noise for speech; use headphones in noisy rooms.
export class SpeechDetector {
  active = false;
  private voiced = 0;
  private quiet = 0;
  private prefix: ArrayBuffer[] = [];
  reset() { this.active=false; this.voiced=0; this.quiet=0; this.prefix=[]; }
  push(chunk: ArrayBuffer, rate: number) {
    const samples = new Int16Array(chunk);
    const ms = samples.length / rate * 1000;
    let energy = 0;
    for (const value of samples) energy += (value / 32768) ** 2;
    const voiced = Math.sqrt(energy / Math.max(1,samples.length)) > 0.012;
    let started = false, ended = false, chunks: ArrayBuffer[] = [];
    if (!this.active) {
      this.prefix.push(chunk); if(this.prefix.length>3)this.prefix.shift();
      this.voiced = voiced ? this.voiced + ms : 0;
      if(this.voiced>=120) {
        this.active=true; started=true; this.quiet=0;
        chunks=this.prefix; this.prefix=[];
      }
    } else {
      chunks=[chunk]; this.quiet=voiced?0:this.quiet+ms;
      if(this.quiet>=600) {ended=true;this.reset();}
    }
    return {started,ended,chunks};
  }
}
