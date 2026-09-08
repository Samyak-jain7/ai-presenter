export class Player {
  epoch = 0;
  private tail = 0;
  private nodes = new Set<AudioBufferSourceNode>();
  private finished = false;
  private context: AudioContext;
  private active: (value:boolean)=>void;
  private drained: (epoch:number)=>void;
  constructor(context: AudioContext, active: (value: boolean) => void, drained: (epoch:number) => void) {
    this.context=context; this.active=active; this.drained=drained;
  }
  clear(epoch: number) {
    this.epoch = epoch; this.finished = false;
    for (const node of this.nodes) { node.onended = null; node.stop(); node.disconnect(); }
    this.nodes.clear(); this.tail = this.context.currentTime; this.active(false);
  }
  add(data: string, epoch: number) {
    if (epoch !== this.epoch) return;
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    if (bytes.length === 0 || bytes.length % 2) return;
    const view = new DataView(bytes.buffer);
    const buffer = this.context.createBuffer(1, bytes.length / 2, 24000);
    const channel = buffer.getChannelData(0);
    for (let i=0;i<channel.length;i++) channel[i] = view.getInt16(i*2,true)/32768;
    const node = this.context.createBufferSource(); node.buffer = buffer; node.connect(this.context.destination);
    this.nodes.add(node); this.active(true);
    node.onended = () => { node.disconnect(); this.nodes.delete(node); this.check(); };
    const at = Math.max(this.context.currentTime + 0.015, this.tail);
    node.start(at); this.tail = at + buffer.duration;
  }
  end(epoch: number) { if (epoch === this.epoch) { this.finished = true; this.check(); } }
  private check() {
    if (!this.nodes.size) {
      this.active(false);
      if (this.finished) { this.finished = false; this.drained(this.epoch); }
    }
  }
}
