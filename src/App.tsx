import { useEffect, useRef, useState } from 'react';
import deck from '../shared/deck.json';
import { Player } from './player';
import { SpeechDetector } from './speech';
import './style.css';

type Status = 'idle'|'connecting'|'listening'|'thinking'|'speaking'|'error';
export default function App() {
  const [slide, setSlide] = useState(1), [status, setStatus] = useState<Status>('idle');
  const [session, setSession] = useState(false), [muted, setMuted] = useState(false);
  const [mode,setMode] = useState('presentation'), [resume,setResume] = useState(1);
  const [error,setError] = useState(''), [caption,setCaption] = useState('');
  const runtime = useRef<{socket?:WebSocket, context?:AudioContext, stream?:MediaStream, mic?:AudioWorkletNode, source?:MediaStreamAudioSourceNode, player?:Player, detector?:SpeechDetector, timeout?:ReturnType<typeof setTimeout>, ready:boolean, muted:boolean, generation:number}>({ready:false, muted:false, generation:0});
  const send = (message:object) => { const s=runtime.current.socket; if(s?.readyState===WebSocket.OPEN) s.send(JSON.stringify(message)); };
  function stop(next:Status='idle') {
    const r=runtime.current; r.generation++; r.ready=false;
    clearTimeout(r.timeout);
    if (r.socket) { r.socket.onclose=null; r.socket.onerror=null; r.socket.onmessage=null; send({type:'end'}); r.socket.close(); }
    r.player?.clear(-1); r.mic?.disconnect(); r.source?.disconnect();
    r.stream?.getTracks().forEach(t=>t.stop()); void r.context?.close();
    runtime.current={ready:false,muted:false,generation:r.generation};
    setSession(false); setMuted(false); setStatus(next);
  }
  useEffect(()=>()=>stop(),[]);
  async function start() {
    const r=runtime.current; const generation=++r.generation;
    setError(''); setCaption(''); setMode('presentation');setResume(slide);setStatus('connecting'); setSession(true);
    const fail=(message:string)=>{ if(runtime.current.generation===generation) { stop('error'); setError(message); } };
    try {
      r.context=new AudioContext({sampleRate:24000}); await r.context.resume();
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(runtime.current.generation!==generation) {stream.getTracks().forEach(t=>t.stop());return;}
      r.stream=stream;
      await r.context.audioWorklet.addModule('/microphone.js');
      if(runtime.current.generation!==generation) return;
      r.player=new Player(r.context, active=>{if(active)setStatus('speaking');}, epoch=>{setStatus('listening');send({type:'drained',epoch});});
      r.detector=new SpeechDetector();
      r.source=r.context.createMediaStreamSource(stream); r.mic=new AudioWorkletNode(r.context,'microphone');
      r.source.connect(r.mic); r.mic.connect(r.context.destination);
      r.mic.port.onmessage=({data}:{data:ArrayBuffer})=>{
        if(!r.ready||r.muted||runtime.current.generation!==generation)return;
        const speech=r.detector!.push(data,r.context!.sampleRate);
        if(speech.started){
          r.player!.clear(r.player!.epoch+1);setStatus('listening');setCaption('');
          send({type:'speech-start'});
        }
        for(const chunk of speech.chunks){
          const bytes=new Uint8Array(chunk); let binary=''; for(const b of bytes)binary+=String.fromCharCode(b);
          send({type:'audio',data:btoa(binary),rate:r.context!.sampleRate});
        }
        if(speech.ended){send({type:'speech-end'});setStatus('thinking');}
      };
      const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/session`); r.socket=socket;
      r.timeout=setTimeout(()=>fail('The connection timed out. Check the backend and internet connection, then start again.'),20000);
      socket.onopen=()=>send({type:'start',slide});
      socket.onerror=()=>fail('Cannot connect to the backend. Start the server and try again.');
      socket.onclose=()=>fail('The connection ended. Start a new session to reconnect.');
      socket.onmessage=event=>{
        if(runtime.current.generation!==generation)return;
        const m=JSON.parse(event.data);
        if(m.type==='ready'){clearTimeout(r.timeout);r.ready=true;setStatus('listening');}
        if(m.type==='state'){setSlide(m.slide);setMode(m.mode);setResume(m.resume);}
        if(m.type==='clear'){r.player!.clear(m.epoch);setCaption('');setStatus('listening');}
        if(m.type==='audio'&&!r.detector!.active)r.player!.add(m.data,m.epoch);
        if(m.type==='turn-end'&&!r.detector!.active)r.player!.end(m.epoch);
        if(m.type==='status')setStatus(m.status);
        if(m.type==='transcript')setCaption(previous=>(m.speaker==='you'?`You: ${m.text}`:(previous.startsWith('You:')?'':previous)+m.text).slice(-600));
        if(m.type==='error')fail(m.message);
      };
      stream.getTracks().forEach(track=>track.onended=()=>fail('Microphone disconnected. Reconnect it and start again.'));
    } catch(e) {fail(e instanceof DOMException && e.name==='NotAllowedError'?'Microphone permission was denied. Allow microphone access and start again.':'Could not start audio. Check your microphone and try again.');}
  }
  function choose(id:number) {
    if(session){runtime.current.player?.clear(runtime.current.player.epoch+1);send({type:'navigate',slide:id});}else setSlide(id);
  }
  function mute() {
    const r=runtime.current; r.muted=!r.muted; setMuted(r.muted);
    r.stream?.getAudioTracks().forEach(t=>t.enabled=!r.muted);
    if(r.muted){r.detector?.reset();send({type:'mute'});}
  }
  const current=deck[slide-1];
  return <main>
    <header><a className="brand" href="/" aria-label="AI Presenter home"><span className="brandmark">AI</span>AI Presenter<span className="brand-sub">/ voice studio</span></a><span className="project-label">AN INTERACTIVE PRESENTATION <span className="live-dot"/></span></header>
    <div className="workspace">
      <aside aria-label="Slide navigation"><div className="aside-label">THE DECK <span>06 SLIDES</span></div>{deck.map(s=><button className={`slide-tab ${s.id===slide?'selected':''}`} key={s.id} onClick={()=>choose(s.id)} aria-current={s.id===slide?'step':undefined} disabled={status==='connecting'}><span className="slide-number">0{s.id}</span><span>{s.eyebrow}<small>{s.title}</small></span>{s.id===slide&&<span className="tab-dot"/>}</button>)}<div className="aside-footer"><span>✳</span><p>A presentation that<br/>listens back.</p></div></aside>
      <section className="stage" aria-label="Presentation">
        <div className="stage-heading"><span>HOW AI VOICE AGENTS WORK</span><span>{String(slide).padStart(2,'0')} <span className="muted">/ 06</span></span></div>
        <article className="slide" aria-live="polite"><div className="slide-copy"><p className="eyebrow"><span/> {current.eyebrow}</p><h1>{current.title}</h1><p className="summary">{current.summary}</p><ul>{current.points.map((p,i)=><li key={p}><span>0{i+1}</span>{p}</li>)}</ul></div><div className={`visual visual-${current.visual}`} aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="core"><div className="bars">{[18,34,52,72,42,62,30,48,22].map((h,i)=><i key={i} style={{height:h,animationDelay:`${i*0.12}s`}}/>)}</div></div><span className="orbit-label label-top">{['LISTEN','AUDIO IN','CONTEXT','RESPONSE','LISTEN AGAIN','BROWSER'][slide-1]}</span><span className="orbit-label label-bottom">{['UNDERSTAND','MEANING','RELEVANT SLIDE','AUDIO OUT','STOP · RESET','NODE → GEMINI'][slide-1]}</span><span className="visual-caption">{String(slide).padStart(2,'0')} / THE CONVERSATION LOOP</span></div><div className="slide-footer"><span>AI PRESENTER</span><div className="progress">{deck.map(s=><i key={s.id} className={s.id<=slide?'filled':''}/>)}</div></div></article>
        <div className="slide-controls"><button onClick={()=>choose(Math.max(1,slide-1))} disabled={slide===1||status==='connecting'} aria-label="Previous slide">←</button><span>{current.eyebrow}</span><button onClick={()=>choose(Math.min(6,slide+1))} disabled={slide===6||status==='connecting'} aria-label="Next slide">→</button></div>
      </section>
    </div>
    <section className="voice-panel" aria-label="Voice session"><div className="voice-identity"><div className={`voice-orb ${status}`}><span/><span/><span/></div><div><strong>{status==='idle'?'Your presenter is ready':status==='error'?'Let’s reconnect':status==='connecting'?'Connecting your presenter':status==='speaking'?'Presenting. You can interrupt.':status==='thinking'?'Thinking about your question':muted?'Microphone muted':'Listening to you'}</strong><p role="status" data-testid="status">{status}{session&&` · ${mode==='presentation'?'Presenting':mode==='paused'?'Slide selected · silent':mode==='explanation'?'Explaining this slide':`Q&A · resume at slide ${resume}`}`}</p></div></div><div className="voice-actions">{session?<><button className={`mute-button ${muted?'is-muted':''}`} onClick={mute} disabled={status==='connecting'} aria-pressed={muted}>{muted?'Unmute microphone':'Mute microphone'}</button><button className="resume-button" onClick={()=>send({type:'control',action:'explain'})} disabled={status==='connecting'}>Explain slide</button><button className="resume-button" onClick={()=>send({type:'control',action:'resume'})} disabled={status==='connecting'}>Resume ↗</button><button className="end-button" onClick={()=>stop()}>End session</button></>:<button className="start-button" onClick={()=>void start()}><span>◉</span> Start presentation <span>↗</span></button>}</div></section>
    {error?<p role="alert" className="error">{error}</p>:<p className="caption" aria-live="polite">{caption||'Try asking “How do interruptions work?” while the presenter is speaking.'}</p>}
    <footer><span>Use headphones for the best conversation.</span><span>Audio is sent to Google while connected. Nothing is recorded locally.</span></footer>
  </main>;
}
