import { loadConfig } from './config.mjs';

const seconds = Number(process.argv[process.argv.indexOf('--max-seconds') + 1]);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 45) {
  console.error('Use --max-seconds between 5 and 45.');
  process.exit(1);
}
let config;
try { config = loadConfig(); }
catch (error) { console.error(error.message); process.exit(1); }
const start = Date.now();
const evidence = { model: config.model, setup: false, audioBytes: 0, toolAcknowledged: false, turnComplete: false };
let failure;
let closing = false;
let reported = false;
const url = new URL('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent');
url.searchParams.set('key', config.apiKey);
const socket = new WebSocket(url);
socket.binaryType = 'arraybuffer';
const classify = text => /quota|exhaust|resource_exhausted|429/i.test(text) ? 'quota'
  : /key|auth|permission|401|403/i.test(text) ? 'authentication'
  : /model|not found|unsupported/i.test(text) ? 'model-or-configuration' : 'transport-or-provider';
function report(closed) {
  if (reported) return;
  reported = true;
  clearTimeout(deadline);
  const ok = !failure && closed && evidence.setup && evidence.toolAcknowledged && evidence.audioBytes > 0 && evidence.turnComplete;
  console.log(JSON.stringify({ ok, ...evidence, closed, elapsedMs: Date.now() - start, failure: failure || (ok ? undefined : 'incomplete') }));
  process.exitCode = ok ? 0 : 1;
}
function stop(reason) {
  failure ||= reason;
  if (closing) return;
  closing = true;
  socket.close();
}
const deadline = setTimeout(() => {
  failure ||= 'timeout';
  socket.close();
  report(socket.readyState === WebSocket.CLOSED);
  process.exit(1); // Hard cap also closes a stuck transport; never retry automatically.
}, seconds * 1000);
socket.addEventListener('open', () => socket.send(JSON.stringify({ setup: {
  model: `models/${config.model}`,
  generationConfig: { responseModalities: ['AUDIO'] },
  systemInstruction: { parts: [{ text: 'You are a concise voice presenter. Available slides: 2 speech recognition, 5 interruptions and turn-taking. Always call go_to_slide before answering a topic question. After the tool result answer in one short sentence, then stop.' }] },
  tools: [{ functionDeclarations: [{ name: 'go_to_slide', description: 'Display the slide relevant to the question.', parameters: { type: 'OBJECT', properties: { slideId: { type: 'INTEGER', description: '2 for speech recognition; 5 for interruptions and turn-taking.' } }, required: ['slideId'] } }] }],
} })));
socket.addEventListener('message', event => {
  if (closing) return;
  try {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString());
    if (message.error) return stop(classify(JSON.stringify(message.error)));
    if (message.setupComplete) {
      evidence.setup = true;
      socket.send(JSON.stringify({ realtimeInput: { text: 'How do you stop talking when I interrupt?' } }));
    }
    for (const call of message.toolCall?.functionCalls || []) {
      const valid = call.name === 'go_to_slide' && call.args?.slideId === 5 && typeof call.id === 'string';
      if (!valid) return stop('invalid-navigation-call');
      socket.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result: { slideId: 5, displayed: true } } }] } }));
      evidence.toolAcknowledged = true;
    }
    for (const part of message.serverContent?.modelTurn?.parts || []) {
      if (part.inlineData?.mimeType?.startsWith('audio/pcm')) {
        const bytes = Buffer.from(part.inlineData.data, 'base64');
        if (bytes.length % 2) return stop('malformed-pcm');
        evidence.audioBytes += bytes.length;
      }
    }
    if (message.serverContent?.turnComplete) {
      evidence.turnComplete = true;
      stop(evidence.toolAcknowledged && evidence.audioBytes > 0 ? undefined : 'missing-audio-or-tool');
    }
  } catch { stop('malformed-provider-message'); }
});
socket.addEventListener('error', () => stop('transport'));
socket.addEventListener('close', event => {
  evidence.closeCode = event.code;
  if (event.reason) evidence.closeReason = event.reason.replaceAll(config.apiKey, '[REDACTED]').replace(/(?:AIza|AQ\.)[\w.-]+/g, '[REDACTED]').slice(0, 500);
  if (!closing) failure ||= classify(event.reason);
  report(true);
});
