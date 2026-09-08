import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { loadConfig } from '../scripts/config.mjs';
import { connectSession } from './session.mjs';

const port = Number(process.env.PORT || 3001);
const root = resolve('dist');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' };
const server = createServer(async (req, res) => {
  if (req.url === '/health') { res.writeHead(200, {'Content-Type':'application/json'}); res.end('{"ok":true}'); return; }
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!path.startsWith(root + sep) && path !== root) throw new Error();
    const file = path === root ? resolve(root, 'index.html') : path;
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found. Run npm run dev for development, or npm run build first.'); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/session' || ![`http://localhost:${port}`, `http://127.0.0.1:${port}`, 'http://localhost:5173', 'http://127.0.0.1:5173'].includes(req.headers.origin)) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return;
  }
  if (wss.clients.size) { socket.end('HTTP/1.1 409 Conflict\r\n\r\n'); return; }
  wss.handleUpgrade(req, socket, head, browser => {
    let config;
    try { config = loadConfig(); } catch (error) { browser.send(JSON.stringify({type:'error',message:error.message})); browser.close(); return; }
    connectSession(browser, ({apiKey}) => {
      const url = new URL('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent');
      url.searchParams.set('key',apiKey);
      const provider = new WebSocket(url); provider.binaryType = 'arraybuffer'; return provider;
    }, config);
  });
});
server.listen(port, '127.0.0.1', () => console.log(`AI Presenter backend: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
  for (const client of wss.clients) client.close();
  server.close();
  setTimeout(() => process.exit(0), 500).unref();
});
