import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const dir='security-reports/2026-10-03-remediation';
for(const n of [1,2]){
 const folder=dir+'/api-pass-final'+n;
 if(fs.existsSync(folder))fs.renameSync(folder,dir+'/api-pass-before-proxyfix-'+n);
 const log=dir+'/api-final'+n+'-run.log';
 if(fs.existsSync(log))fs.renameSync(log,dir+'/api-before-proxyfix-'+n+'-run.log');
}
const state=[];
for(const n of [1,2]){
 const reset=spawnSync('npx',['tsx',dir+'/reset-disposable.mts','clean-state-before-pass'+n+'.json'],{encoding:'utf8'});
 if(reset.status!==0)throw new Error('Disposable reset failed');
 console.log('Clean disposable DB before pass '+n);
 const handle=fs.openSync(dir+'/api-final'+n+'-run.log','w');
 const result=spawnSync(process.execPath,[dir+'/full-api.mjs','final'+n],{stdio:['ignore',handle,handle]});
 fs.closeSync(handle);
 state.push({pass:n,exitCode:result.status});
 fs.writeFileSync(dir+'/final-run-status.json',JSON.stringify(state,null,2));
 console.log('Final-source API pass '+n+' exit '+result.status);
 if(result.status!==0)throw new Error('Complete API pass '+n+' failed');
}
