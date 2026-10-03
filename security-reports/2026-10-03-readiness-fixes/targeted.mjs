import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),dir=path.join(root,'security-reports/2026-10-03-readiness-fixes');
const env={...process.env};
for(const line of fs.readFileSync('.env','utf8').split('\n')) { const key=line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=/)?.[1];if(key)env[key]=''; }
Object.assign(env,{NODE_ENV:'test',DATABASE_URL:'postgresql://audit:audit_local_only@127.0.0.1:5541/gaming_hub_readiness_8507d07_test',SUPABASE_URL:'http://127.0.0.1:59999',SUPABASE_SERVICE_ROLE_KEY:'audit-dummy-key',SUPABASE_SECRET_KEY:'audit-dummy-key',INTERNAL_API_KEY:'isolated-audit-internal-key',API_URL:'http://127.0.0.1:59998',SOCKET_URL:'http://127.0.0.1:59997',CORS_ORIGIN:'http://localhost:5173',EMAIL_PROVIDER:'mock',REQUIRE_EMAIL_VERIFICATION:'false',COUPON_API_URL:'http://127.0.0.1:59996/api/v1',COUPON_API_KEY:'audit-dummy-key',REDIS_URL:'',LOG_LEVEL:'silent',TOTP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')});
env.TEST_DATABASE_URL=env.DATABASE_URL;
env.DATABASE_LOCK_URL=env.DATABASE_URL;
const files=process.argv.slice(2);
const report=path.join(dir,'targeted-'+Date.now()+'.json');
const args=['run',...files,'--reporter=json','--outputFile='+report];
if(files.every(f=>f.endsWith('.unit.test.ts')))args.push('--config','vitest.unit.config.ts');
const r=spawnSync(path.join(root,'node_modules/.bin/vitest'),args,{cwd:path.join(root,'apps/api'),env,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
fs.writeFileSync(report.replace('.json','.log'),(r.stdout||'')+(r.stderr||''));
console.log('Report',report,'exit',r.status);
if(fs.existsSync(report)){const j=JSON.parse(fs.readFileSync(report)); console.log(JSON.stringify({files:j.testResults.length,tests:j.numTotalTests,passed:j.numPassedTests,failed:j.numFailedTests}));for(const f of j.testResults)for(const a of f.assertionResults)if(a.status==='failed')console.log(a.fullName,a.failureMessages.join('\n'));}
process.exitCode=r.status??1;
