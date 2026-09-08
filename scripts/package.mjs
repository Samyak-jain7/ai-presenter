import { cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
const entries = ['README.md','.env.example','.gitignore','package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts','src','server','shared','public','tests','scripts/dev.mjs','scripts/config.mjs','scripts/probe-live.mjs','scripts/probe-app.mjs','scripts/package.mjs','scripts/check-delivery.mjs','docs/demo-script.md','docs/verification.md','docs/screenshot.png'];
function files(path) {
  if(lstatSync(path).isSymbolicLink())throw Error('Submission must not contain symlinks');
  return lstatSync(path).isDirectory()?readdirSync(path).flatMap(name=>files(join(path,name))):[path];
}
export function packageSource() {
  const paths=entries.flatMap(entry=>files(join(root,entry)));
  for(const path of paths){
    const name=relative(root,path),text=readFileSync(path).toString();
    if(/(^|\/)(\.env(?!\.example$)|node_modules|\.git|\.genesis|\.DS_Store)(\/|$)/.test(name))throw Error('Forbidden submission file');
    if(/(?:AIza[\w-]{25,}|AQ\.[\w.-]{25,})/.test(text))throw Error(`Possible credential in ${name}`);
  }
  const temp=mkdtempSync(join(tmpdir(),'ai-presenter-package-'));
  const folder='ai-presenter';const stage=join(temp,folder);
  const destination=join(root,'release');mkdirSync(destination,{recursive:true});
  const archive=join(destination,'ai-presenter-submission.zip');
  try {
    for(const entry of entries){const target=join(stage,entry);mkdirSync(resolve(target,'..'),{recursive:true});cpSync(join(root,entry),target,{recursive:true});}
    // Remove only our previous generated archive; zip otherwise retains obsolete entries.
    if(existsSync(archive))rmSync(archive);
    const result=spawnSync('zip',['-q','-r',archive,folder],{cwd:temp,encoding:'utf8'});
    if(result.status!==0)throw Error('ZIP creation failed; install the zip command.');
    const sha256=createHash('sha256').update(readFileSync(archive)).digest('hex');
    writeFileSync(join(destination,'SHA256SUMS'),`${sha256}  ai-presenter-submission.zip\n`);
    return {archive,files:paths.length,sha256};
  }finally{rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(packageSource()));
