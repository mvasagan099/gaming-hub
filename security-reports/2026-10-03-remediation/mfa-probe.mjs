import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd();
const dir = path.join(root, 'security-reports/2026-10-03-remediation');
fs.mkdirSync(dir,{recursive:true});
const auditDir=path.join(root,'security-reports/2026-10-03');
const env = { ...process.env };
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const key = line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=/)?.[1];
  if (key) env[key] = '';
}
Object.assign(env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://audit:audit_local_only@127.0.0.1:5541/gaming_hub_remediation_fresh_20261003_test',
  SUPABASE_URL: 'http://127.0.0.1:59999', SUPABASE_SERVICE_ROLE_KEY: 'audit-dummy-key', SUPABASE_SECRET_KEY: 'audit-dummy-key',
  SUPABASE_PUBLISHABLE_KEY: 'audit-dummy-key', INTERNAL_API_KEY: 'isolated-audit-internal-key',
  API_URL: 'http://127.0.0.1:59998', SOCKET_URL: 'http://127.0.0.1:59997', CORS_ORIGIN: 'http://localhost:5173',
  EMAIL_PROVIDER: 'mock', REQUIRE_EMAIL_VERIFICATION: 'false', COUPON_API_URL: 'http://127.0.0.1:59996/api/v1',
  COUPON_API_KEY: 'audit-dummy-key', REDIS_URL: '', LOG_LEVEL: 'silent',
  VITE_SUPABASE_URL: 'http://127.0.0.1:59999', VITE_SUPABASE_ANON_KEY: 'audit-dummy-key', VITE_SUPABASE_PUBLISHABLE_KEY: 'audit-dummy-key',
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
});
env.TEST_DATABASE_URL=env.DATABASE_URL;
const svc = 'src/services/__tests__/';
const groups = {
  units: fs.readdirSync('apps/api/src/services/__tests__').filter(f => f.endsWith('.unit.test.ts')).map(f => svc + f),
  auth: ['loginTimeMfa','mfaSessionLifecycle','singleActiveSession','passwordResetAuthFlow','totpEncryptionMigration','adminSecurityHardeningEngine','idorAndEconomyValidation','kycSecurityHardening','kycAddressSync'].map(f=>svc+f+'.test.ts'),
  finance: ['financialConcurrencyAndRecovery','financialReconciliationEngine','financialIdempotency','walletRequests','walletTransactionService','couponVaultLiveIntegration','affiliateSystem','affiliateFraud','affiliateReconciliation','referralSystem'].map(f=>svc+f+'.test.ts').concat(['src/routes/__tests__/wallet.test.ts','src/routes/__tests__/withdrawalVerificationSmoke.test.ts']),
  privacy_abuse: ['playerProfileSystem','globalPlatformSearch','globalRateLimitingEngine','suspiciousActivityEngine','gameResultSecurity','securityAttackSimulation','tournamentAdminControlCenter','brevoEmailProvider','smtpEmailProvider'].map(f=>svc+f+'.test.ts'),
  legacyMfaProbe: [svc+"securityRemediationHardening.test.ts"],
  probes: [path.join(auditDir,'audit-probes.test.ts')],
};
fs.writeFileSync(path.join(dir,'test-manifest.json'),JSON.stringify(groups,null,2));
const selected = process.argv[2];
const results = [];
for (const [name,files] of Object.entries(groups)) {
  if (selected && selected !== name) continue;
  console.log('START',name,files.length,'files; DB 127.0.0.1:5541/gaming_hub_remediation_fresh_20261003_test');
  const args = ['run',...files, ...(name==='legacyMfaProbe'?['-t',"legacy MFA verification cannot verify"]:[]),'--reporter=json', '--outputFile='+path.join(dir,name+'.json')];
  if(name==='units') args.push('--config','vitest.unit.config.ts');
  if(name==='probes') args.push('--config',path.join(auditDir,'audit.config.mts'));
  const start=Date.now();
  const result=spawnSync(path.join(root,'node_modules/.bin/vitest'),args,{cwd:path.join(root,'apps/api'),env,encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});
  fs.writeFileSync(path.join(dir,name+'.log'),(result.stdout||'')+(result.stderr||''));
  const summary={group:name,exitCode:result.status,durationSeconds:(Date.now()-start)/1000,error:result.error?.message};
  if(fs.existsSync(path.join(dir,name+'.json'))){const j=JSON.parse(fs.readFileSync(path.join(dir,name+'.json')));Object.assign(summary,{tests:j.numTotalTests,passed:j.numPassedTests,failed:j.numFailedTests,skipped:j.numPendingTests,files:j.testResults.length});}
  results.push(summary);fs.writeFileSync(path.join(dir,selected?selected+'-summary.json':'test-summary.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(summary));
}
if (results.some(r => r.exitCode !== 0)) process.exitCode = 1;
