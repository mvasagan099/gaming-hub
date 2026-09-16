import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = decodeURIComponent(new URL('..', import.meta.url).pathname);
const files = [];
function walk(dir) { for (const n of readdirSync(dir)) { const p=join(dir,n); if (statSync(p).isDirectory()) walk(p); else if (/__tests__\/.*\.test\.ts$/.test(relative(root,p))) files.push(relative(root,p)); } }
walk(join(root,'src')); files.sort();
const groups = { A:[], B:[], C:[], D:[], E:[] };
for (const f of files) {
  const n=f.split('/').pop();
  let g='E';
  if (/password|mfa|singleActive|deepLink|idor|kyc|security|totp|playerProfile|globalPlatformSearch|globalRateLimiting|smtp|productionSmoke/.test(n)) g='A';
  else if (/wallet|coupon|financial|coinWorkflow|productionCoin|insufficientBalance|atomicEntryFee|entryFeeConfirmation/.test(n)) g='B';
  else if (/^tournament|^automaticTournament|universalSettlement|centralRefund/.test(n)) g='C';
  else if (/match|multiplayer|persistentMatch|matchmaking|unifiedGame|practiceMatch|gameHistory|gameResult|gameCoin|concurrentJoin|universalMatchRoom/.test(n)) g='D';
  groups[g].push(f);
}
const dup = Object.values(groups).flat().filter((f,i,a)=>a.indexOf(f)!==i);
console.log(JSON.stringify({manifest:groups,totalDiscovered:files.length,totalGrouped:Object.values(groups).flat().length,duplicates:dup},null,2));
const pass=process.argv[2]||'1'; const results=[];
for (const [name,list] of Object.entries(groups)) {
  const t=Date.now(); const r=spawnSync('npx',['vitest','run',...list,'--reporter=json'],{cwd:root,encoding:'utf8',timeout:240000,maxBuffer:30*1024*1024});
  let summary={}; try { const m=r.stdout.match(/\{[\s\S]*\}\s*$/); if(m) summary=JSON.parse(m[0]); } catch {}
  results.push({group:name,files:list.length,tests:summary.numTotalTests??null,passed:summary.numPassedTests??null,failed:summary.numFailedTests??(r.status===0?0:null),skipped:summary.numPendingTests??null,durationMs:Date.now()-t,exit:r.status,timeout:r.error?.code==='ETIMEDOUT'});
  console.log(JSON.stringify(results.at(-1)));
}
console.log(JSON.stringify({pass,results},null,2));
