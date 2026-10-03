import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
const root=process.cwd(),dir='security-reports/2026-10-03-readiness-8507d07';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gaming-hub-native-audit-'));
for(const file of ['package.json','capacitor.config.ts'])fs.copyFileSync(root+'/apps/web/'+file,temp+'/'+file);
const files=execFileSync('git',['ls-files','-z','apps/web/android','apps/web/ios']).toString().split('\0').filter(Boolean);
for(const file of files){const target=path.join(temp,file.slice('apps/web/'.length));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
fs.cpSync(root+'/apps/web/dist',temp+'/dist',{recursive:true});
fs.symlinkSync(root+'/node_modules',temp+'/node_modules','dir');
const results=[];
for(const platform of ['android','ios']){
 const started=Date.now();
 const r=spawnSync(root+'/node_modules/.bin/cap',['sync',platform],{cwd:temp,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
 fs.writeFileSync(dir+'/cap-sync-'+platform+'.log',(r.stdout||'')+(r.stderr||''));
 results.push({platform,exitCode:r.status,error:r.error?.message,durationSeconds:(Date.now()-started)/1000});
}
fs.writeFileSync(dir+'/native-sync-summary.json',JSON.stringify({scope:'Isolated copy of tracked native project files plus freshly built dist; repository native files not modified; sync is not a signed native build or device smoke test',results},null,2));
console.log(JSON.stringify(results));
fs.rmSync(temp,{recursive:true,force:true});
if(results.some(x=>x.exitCode!==0))process.exitCode=1;
