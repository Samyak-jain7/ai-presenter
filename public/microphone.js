class Microphone extends AudioWorkletProcessor {
  constructor() { super(); this.chunk = new Int16Array(2048); this.index = 0; }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) for (const sample of input) {
      this.chunk[this.index++] = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
      if (this.index === this.chunk.length) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(2048); this.index = 0;
      }
    }
    return true;
  }
}
registerProcessor('microphone', Microphone);
