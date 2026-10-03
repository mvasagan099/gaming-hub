import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=process.cwd(),dir=path.join(root,'security-reports/2026-10-03-remediation'),env={...process.env};
for(const line of fs.readFileSync('.env','utf8').split('\n')){const k=line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=/)?.[1];if(k)env[k]='';}
Object.assign(env,{NODE_ENV:'test',DATABASE_URL:'postgresql://unit:dummy@127.0.0.1:1/no_connection_test',SUPABASE_URL:'http://127.0.0.1:59999',INTERNAL_API_KEY:'isolated-audit-internal-key',API_URL:'http://127.0.0.1:59998',SOCKET_URL:'http://127.0.0.1:59997',VITE_SUPABASE_URL:'http://127.0.0.1:59999',VITE_SUPABASE_ANON_KEY:'audit-dummy-key',VITE_SUPABASE_PUBLISHABLE_KEY:'audit-dummy-key',VITE_API_URL:'http://127.0.0.1:59998',VITE_SOCKET_URL:'http://127.0.0.1:59997',LOG_LEVEL:'silent',EMAIL_PROVIDER:'mock'});
const results=[];
for(const [name,cwd,files] of [['game-engine','packages/game-engine',[]],['multiplayer','packages/multiplayer',[]],['web','.', ['apps/web/src/games/chess/utils/chessState.test.ts','apps/web/src/store/multiplayerStore.leave.test.ts']]]){
 const start=Date.now(),report=path.join(dir,name+'.json');const r=spawnSync(path.join(root,'node_modules/.bin/vitest'),['run',...files,'--reporter=json','--outputFile='+report],{cwd:path.join(root,cwd),env,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});fs.writeFileSync(path.join(dir,name+'.log'),(r.stdout||'')+(r.stderr||''));
 const result={name,exitCode:r.status,durationSeconds:(Date.now()-start)/1000};if(fs.existsSync(report)){const j=JSON.parse(fs.readFileSync(report));Object.assign(result,{files:j.testResults.length,tests:j.numTotalTests,passed:j.numPassedTests,failed:j.numFailedTests,skipped:j.numPendingTests});}
 results.push(result);fs.writeFileSync(path.join(dir,'package-summary.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(result));
}
if(results.some(x=>x.exitCode!==0))process.exitCode=1;
