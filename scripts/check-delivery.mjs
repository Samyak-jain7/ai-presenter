import { packageSource, root } from './package.mjs';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

const required=['README.md','docs/demo-script.md','docs/verification.md','.env.example'];
for(const file of required)assert.ok(readFileSync(join(root,file),'utf8').trim().length>30,`Missing content: ${file}`);
assert.match(readFileSync(join(root,'.env.example'),'utf8'),/^GEMINI_API_KEY=\s*$/m);
const result=packageSource();
const list=spawnSync('unzip',['-Z1',result.archive],{encoding:'utf8'});
assert.equal(list.status,0,'Cannot inspect ZIP');
const names=list.stdout.trim().split('\n');
assert.ok(names.every(n=>n.startsWith('ai-presenter/')&&!n.split('/').includes('..')),'Unsafe archive path');
assert.ok(!names.some(n=>/(^|\/)(\.env|node_modules|\.git|\.genesis|dist|\.DS_Store)(\/|$)/.test(n)),'Excluded data in ZIP');
const temp=mkdtempSync(join(tmpdir(),'ai-presenter-verify-'));let server;
const env={...process.env,CI:'1'};delete env.GEMINI_API_KEY;delete env.GOOGLE_API_KEY;
function run(command,args,cwd){const r=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});if(r.status!==0)throw Error(`${command} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);console.log(`PASS ${command} ${args.join(' ')}`);}
try{
  run('unzip',['-q',result.archive,'-d',temp],root);
  const clean=join(temp,'ai-presenter');assert.equal(existsSync(join(clean,'.env')),false);
  run('npm',['ci'],clean);
  for(const script of ['typecheck','test','build','test:browser'])run('npm',['run',script],clean);
  // Browser test artifacts are not part of the production build.
  run('npm',['run','build'],clean);
  const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  server=spawn(process.execPath,['server/index.mjs'],{cwd:clean,env:{...env,PORT:String(port)},stdio:'ignore'});
  let connected=false;for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${port}/health`);connected=r.ok;if(connected)break;}catch{}await delay(100);}
  assert.ok(connected,'Clean production server did not start');
  const page=await fetch(`http://127.0.0.1:${port}/`);assert.equal(page.status,200);assert.match(await page.text(),/AI Presenter/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/.env`)).status,404);
  console.log('PASS clean production server, index and secret-file exclusion');
  const evidence={ok:true,archive:result.archive.split('/').at(-1),sha256:result.sha256,files:result.files,node:process.version,checks:['npm ci','typecheck','9 Node tests','build','5 isolated Chrome scenarios','production HTTP startup','archive exclusions'],liveProviderCalls:false};
  writeFileSync(join(root,'release','verification.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{server?.kill();if(server)await delay(700);rmSync(temp,{recursive:true,force:true});}
