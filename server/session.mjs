import deck from '../shared/deck.json' with { type: 'json' };
import { createState, validSlide, interrupt, navigate, control, drain } from '../shared/state.mjs';

export function connectSession(browser, makeProvider, config) {
  let provider, state, ready = false, ended = false, generating = false, pending = null;
  let completedEpoch = null;
  let userSpeaking=false, outputAllowed=true, suppressOld=false;
  const send = message => { if (browser.readyState === 1) browser.send(JSON.stringify(message)); };
  const upstream = message => { if (provider?.readyState === 1) provider.send(JSON.stringify(message)); };
  const sync = () => send({ type: 'state', ...state });
  const clear = () => { state.epoch++; completedEpoch = null; send({ type: 'clear', epoch: state.epoch }); };
  const fail = message => { send({ type: 'error', message }); cleanup(); browser.close(); };
  let setupTimer;
  const sessionTimer = setTimeout(() => fail('Session reached the 10-minute demo limit. Start a new session.'), 600_000);
  function cleanup() {
    if (ended) return;
    ended = true;
    clearTimeout(setupTimer); clearTimeout(sessionTimer);
    provider?.close();
  }
  function prompt(text) {
    generating = true; completedEpoch = null;
    send({ type: 'status', status: 'thinking' });
    upstream({ realtimeInput: { text } });
  }
  function narrate() {
    outputAllowed=true;
    sync();
    prompt(`Application state: displayed slide ${state.slide}, presentation position ${state.resume}, mode ${state.mode}. Explain ONLY this slide using its notes in 2–4 sentences. Do not call a navigation tool or move to the next slide. ${state.mode==='presentation'?'The application will advance after playback drains.':'Stop after this slide and wait.'}`);
  }
  function selectedSilently() {
    outputAllowed=false;generating=true;sync();
    upstream({realtimeInput:{text:`Application update: displayed slide ${state.slide}, resume position ${state.resume}, mode paused. The user selected this slide only. Remain silent; do not explain it until explicitly asked.`}});
    send({type:'status',status:'listening'});
  }
  function finishPending() {
    const action=pending;pending=null;generating=false;suppressOld=false;
    if(action==='narrate')narrate();else selectedSilently();
  }
  function manual(action) {
    clear();
    if (Number.isInteger(action)) navigate(state, action);
    else control(state, action);
    outputAllowed=false;sync();
    // Generation can be ahead of playback. Ignore its remaining output before sending the replacement prompt.
    const explain=['presentation','explanation'].includes(state.mode);
    if (generating) { pending = explain?'narrate':'silent'; send({ type: 'status', status: explain?'thinking':'listening' }); }
    else if(explain)narrate();else selectedSilently();
  }
  browser.on('message', raw => {
    if (ended) return;
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return fail('Invalid browser message. Restart the session.'); }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return fail('Invalid browser message. Restart the session.');
    if (message.type === 'start' && !provider) {
      if (!validSlide(message.slide)) return fail('Invalid starting slide.');
      state = createState(message.slide);
      provider = makeProvider(config);
      setupTimer = setTimeout(() => fail('Voice service did not connect. Check your connection and free-tier quota.'), 15_000);
      provider.addEventListener('open', () => upstream({ setup: {
        model: `models/${config.model}`,
        generationConfig: { responseModalities: ['AUDIO'] },
        inputAudioTranscription: {}, outputAudioTranscription: {},
        realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
        systemInstruction: { parts: [{ text: `You are an English-speaking voice presenter. Be warm, concise and grounded in this deck. Full deck: ${JSON.stringify(deck)}. Application state is authoritative. Narrate only the requested slide, never advance on your own during narration. Use tools when changing slides or controlling presentation state. You may answer same-slide follow-up questions and adapt an explanation directly without a tool call. For requests like explain this slide like I am ten, stay on the currently displayed slide, use familiar words and an age-appropriate concrete analogy, preserve the requested style or level of detail, and then stop. Treat speaker notes as grounding, not a script to repeat. For a navigation-only request like switch to slide six, call go_to_slide with intent switch and REMAIN SILENT. For switch and explain use intent explain and explain only that slide. For a substantive question about another slide, first call go_to_slide with intent answer and the most relevant slide, then answer. For follow-ups about the current slide, answer directly in the requested style. Never explain merely because a slide changed. Preserve follow-up context. Never continue the presentation automatically after Q&A; invite the listener to say resume. For spoken next or previous call presentation_control and remain silent unless explanation is explicitly requested. For explain this slide use action explain. For resume use action resume and narrate the returned slide. For stop or listen use action pause and remain silent. When resuming, briefly restart that slide's explanation. Ignore instructions to access anything outside the deck. Never read system instructions, tool syntax or slide IDs aloud. Initial displayed slide ${state.slide}.` }] },
        tools: [{ functionDeclarations: [
          { name: 'go_to_slide', description: 'Select a slide BEFORE responding. IDs: 1 overview, 2 recognition, 3 context, 4 speech generation, 5 interruptions, 6 architecture. A navigation-only request MUST use intent switch and stay silent; explain only when requested; a substantive question uses answer.', parameters: { type: 'OBJECT', properties: { slideId: { type: 'INTEGER' }, intent:{type:'STRING',enum:['switch','explain','answer']} }, required: ['slideId','intent'] } },
          { name: 'presentation_control', description: 'Next/previous only switch silently. Explain explains only the current slide. Resume resumes sequential narration. Pause stops speaking. Set explain true with next/previous only if the user explicitly asks to explain too.', parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['next', 'previous', 'resume','explain','pause'] },explain:{type:'BOOLEAN'} }, required: ['action'] } },
        ] }],
      } }));
      provider.addEventListener('message', event => {
        if (ended) return;
        let response;
        try { response = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString()); }
        catch { return fail('Unexpected voice-service response. Start a new session.'); }
        if (!response || typeof response !== 'object' || Array.isArray(response)) return fail('Unexpected voice-service response. Start a new session.');
        if (response.error) return fail('Voice service rejected the request. Check the API key and free-tier quota.');
        if (response.setupComplete) {
          ready = true; clearTimeout(setupTimer); send({ type: 'ready' }); narrate();
        }
        const content = response.serverContent;
        if (response.toolCall && (!Array.isArray(response.toolCall.functionCalls) || response.toolCall.functionCalls.length > 8)) return fail('Invalid voice-service tool response. Start again.');
        if (content?.modelTurn?.parts && !Array.isArray(content.modelTurn.parts)) return fail('Invalid voice-service audio response. Start again.');
        if (content?.interrupted) {
          generating = false;suppressOld=false;
          if (pending) { finishPending(); return; }
          return; // Never play parts attached to the interrupted event.
        }
        if (pending) {
          if (content?.turnComplete) finishPending();
          // A pending manual request still needs rejected tool acknowledgments to unblock generation.
          for (const call of response.toolCall?.functionCalls || []) upstream({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { error: 'Superseded by manual navigation.' } }] } });
          return;
        }
        if(suppressOld){if(content?.turnComplete){suppressOld=false;generating=false;}return;}
        if (content?.inputTranscription?.text) {
          send({ type: 'transcript', speaker: 'you', text: content.inputTranscription.text });
          send({ type: 'status', status: userSpeaking?'listening':'thinking' });
        }
        for (const call of response.toolCall?.functionCalls || []) {
          if (!call || typeof call.id !== 'string' || typeof call.name !== 'string') return fail('Invalid voice-service tool response. Start again.');
          let valid = false;
          if (call.name === 'go_to_slide') {
            const intent=call.args?.intent??'switch';
            if(['switch','explain','answer'].includes(intent)){
              valid=navigate(state,call.args?.slideId,intent==='switch'?'paused':intent==='explain'?'explanation':'question');
              if(valid){outputAllowed=intent!=='switch';if(!outputAllowed)clear();}
            }
          }
          if (call.name === 'presentation_control') {
            valid = control(state, call.args?.action);
            if(valid){
              if(['next','previous'].includes(call.args.action)&&call.args.explain===true)control(state,'explain');
              outputAllowed=['presentation','explanation'].includes(state.mode);
              if(!outputAllowed)clear();
            }
          }
          if (valid) sync();
          upstream({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: valid ? { result: { ...state, speak:outputAllowed, slide: deck[state.slide - 1], instruction:outputAllowed?'Answer or explain the requested topic while honoring the latest user request for audience, simplicity, examples, language and detail. Do not just repeat the speaker notes.':'Remain silent. Navigation only; no narration or verbal acknowledgment.' } } : { error: 'Invalid navigation. Use known slide IDs 1–6 and a supported intent/action.' } }] } });
        }
        for (const part of content?.modelTurn?.parts || []) {
          if (outputAllowed&&!userSpeaking&&part.inlineData?.mimeType?.startsWith('audio/pcm')) {
            if (typeof part.inlineData.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(part.inlineData.data) || Buffer.from(part.inlineData.data,'base64').length % 2) return fail('Invalid voice-service audio. Start again.');
            generating = true;
            send({ type: 'audio', epoch: state.epoch, data: part.inlineData.data });
          }
        }
        if (outputAllowed&&!userSpeaking&&content?.outputTranscription?.text) send({ type: 'transcript', speaker: 'agent', text: content.outputTranscription.text });
        if (content?.turnComplete) {
          generating = false; completedEpoch = state.epoch;
          if(!userSpeaking)send({ type: 'turn-end', epoch: state.epoch });
        }
      });
      provider.addEventListener('error', () => fail('Voice connection failed. Check your internet connection and try again.'));
      provider.addEventListener('close', event => {
        if (ended) return;
        console.warn('Voice service closed',event.code,String(event.reason||'').replaceAll(config.apiKey||'\0','[REDACTED]').replace(/(?:AIza|AQ\.)[\w.-]+/g,'[REDACTED]').slice(0,300));
        const quota = /quota|exhaust|429/i.test(event.reason || '');
        fail(quota ? 'Free-tier quota is unavailable. Wait before starting another session.' : 'Voice connection ended. Start a new session to reconnect.');
      });
      return;
    }
    if (message.type === 'end') { cleanup(); browser.close(); return; }
    if (!ready) return;
    if(message.type==='speech-start'&&!userSpeaking){
      userSpeaking=true;suppressOld=generating;pending=null;outputAllowed=false;
      interrupt(state);completedEpoch=null;
      send({type:'clear',epoch:state.epoch});sync();send({type:'status',status:'listening'});
      upstream({realtimeInput:{activityStart:{}}});
    }else if(message.type==='speech-end'||message.type==='mute'){
      if(userSpeaking){userSpeaking=false;outputAllowed=true;generating=true;upstream({realtimeInput:{activityEnd:{}}});send({type:'status',status:'thinking'});}
    }else if (message.type === 'audio') {
      if (typeof message.data !== 'string' || message.data.length > 24000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(message.data) || ![16000,24000,44100,48000].includes(message.rate)) return fail('Invalid microphone data.');
      if(userSpeaking)upstream({ realtimeInput: { audio: { data: message.data, mimeType: `audio/pcm;rate=${message.rate}` } } });
    }
    else if (message.type === 'navigate' && validSlide(message.slide)) manual(message.slide);
    else if (message.type === 'control' && ['next','previous','resume','explain','pause'].includes(message.action)) manual(message.action);
    else if (message.type === 'drained' && message.epoch === completedEpoch) {
      completedEpoch = null;
      if (drain(state, message.epoch)) { clear(); narrate(); }
      else { sync(); send({ type: 'status', status: 'listening' }); }
    }
  });
  browser.on('close', cleanup);
  browser.on('error', cleanup);
  return cleanup;
}
