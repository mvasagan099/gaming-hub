import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),dir=path.join(root,'security-reports/2026-10-03-readiness-fixes');
const env={...process.env};
for(const line of fs.readFileSync('.env','utf8').split('\n')) { const key=line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=/)?.[1];if(key)env[key]=''; }
Object.assign(env,{NODE_ENV:'test',DATABASE_URL:'postgresql://audit:audit_local_only@127.0.0.1:5541/gaming_hub_readiness_8507d07_test',SUPABASE_URL:'http://127.0.0.1:59999',SUPABASE_SERVICE_ROLE_KEY:'audit-dummy-key',SUPABASE_SECRET_KEY:'audit-dummy-key',INTERNAL_API_KEY:'isolated-audit-internal-key',API_URL:'http://127.0.0.1:59998',SOCKET_URL:'http://127.0.0.1:59997',CORS_ORIGIN:'http://localhost:5173',EMAIL_PROVIDER:'mock',REQUIRE_EMAIL_VERIFICATION:'false',COUPON_API_URL:'http://127.0.0.1:59996/api/v1',COUPON_API_KEY:'audit-dummy-key',REDIS_URL:'',LOG_LEVEL:'silent',TOTP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')});
env.TEST_DATABASE_URL=env.DATABASE_URL;
env.DATABASE_LOCK_URL=env.DATABASE_URL;
function walk(p){return fs.readdirSync(path.join(root,p),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):[p+'/'+e.name]);}
const files=walk('apps/api/src').filter(f=>f.endsWith('.test.ts')).map(f=>f.replace('apps/api/','')).sort();
const buckets={U:[],A:[],B:[],C:[],D:[],E:[]};
for(const file of files){ const name=path.basename(file);const category=file.endsWith('.unit.test.ts')?'U':/auth|mfa|session|password|totp|kyc|security|auditRemediation|idor/i.test(name)?'A':/wallet|withdrawal|coupon|financial|affiliate|referral|economy|coin|insufficient|entryFees/i.test(name)?'B':/tournament|tier|scheduler/i.test(name)?'C':/room|match|game|multiplayer|carrom/i.test(name)?'D':'E';buckets[category].push(file);}
const groups={};
for(const [category,list] of Object.entries(buckets)){let part=[];let index=1;const emit=()=>{if(part.length){groups[category+index++]=part;part=[];}};for(const file of list){if(/LoadPerformance|allGameTier|automaticTournament|AdminManagement/i.test(file)){emit();part=[file];emit();}else{part.push(file);if(part.length===4)emit();}}emit();}
const assigned=Object.values(groups).flat();
if(assigned.length!==files.length || new Set(assigned).size!==files.length)throw new Error('Manifest coverage/duplication failure');
fs.writeFileSync(path.join(dir,'full-api-manifest.json'),JSON.stringify({discovered:files.length,assigned:assigned.length,missing:[],duplicates:[],groups},null,2));
const pass=process.argv[2]||'1',selected=process.argv[3];
fs.mkdirSync(path.join(dir,'api-pass-'+pass),{recursive:true});
const summaryPath=path.join(dir,'api-pass-'+pass,'summary.json');
let results=selected&&fs.existsSync(summaryPath)?JSON.parse(fs.readFileSync(summaryPath)):[];
console.log('MANIFEST',files.length,'files, 0 missing, 0 duplicates;',JSON.stringify(groups));
for(const [group,list] of Object.entries(groups)){
 if(selected && selected!==group)continue;
 const report=path.join(dir,'api-pass-'+pass,group+'.json');
 const args=['run',...list,'--reporter=json','--outputFile='+report];if(group.startsWith('U'))args.push('--config','vitest.unit.config.ts');
 console.log('START',group,list.length,'files');const start=Date.now();
 const r=spawnSync(path.join(root,'node_modules/.bin/vitest'),args,{cwd:path.join(root,'apps/api'),env,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
 fs.writeFileSync(report.replace('.json','.log'),(r.stdout||'')+(r.stderr||''));
 const result={group,exitCode:r.status,durationSeconds:(Date.now()-start)/1000,error:r.error?.message};
 if(fs.existsSync(report)){const j=JSON.parse(fs.readFileSync(report));Object.assign(result,{files:j.testResults.length,tests:j.numTotalTests,passed:j.numPassedTests,failed:j.numFailedTests,skipped:j.numPendingTests});}
 results=results.filter(x=>x.group!==group);results.push(result);fs.writeFileSync(summaryPath,JSON.stringify(results,null,2));console.log(JSON.stringify(result));
}
if(results.some(r=>r.exitCode!==0))process.exitCode=1;
