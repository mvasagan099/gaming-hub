import { spawnSync } from 'node:child_process';
const groups = {
  B1: ['src/routes/__tests__/wallet.test.ts','src/services/__tests__/walletHistory.test.ts','src/services/__tests__/walletNotificationEngine.test.ts','src/services/__tests__/walletRequests.test.ts','src/services/__tests__/walletSyncEngine.test.ts','src/services/__tests__/walletTransactionService.test.ts'],
  B2: ['src/services/__tests__/couponVaultIntegration.unit.test.ts','src/services/__tests__/couponVaultLiveIntegration.test.ts'],
  B3: ['src/services/__tests__/financialConcurrencyAndRecovery.test.ts','src/services/__tests__/financialEconomy.test.ts','src/services/__tests__/financialIdempotency.test.ts','src/services/__tests__/financialReconciliationEngine.test.ts'],
  B4: ['src/services/__tests__/atomicEntryFee.test.ts','src/services/__tests__/coinWorkflowAudit.unit.test.ts','src/services/__tests__/entryFeeConfirmationEngine.test.ts','src/services/__tests__/insufficientBalanceExperience.test.ts','src/services/__tests__/productionCoinVerification.unit.test.ts'],
};
console.log(JSON.stringify(groups,null,2));
for (const [group,files] of Object.entries(groups)) {
  const start=Date.now(); const r=spawnSync('npx',['vitest','run',...files,'--reporter=json'],{encoding:'utf8',timeout:180000,maxBuffer:30*1024*1024});
  let s={}; try { const m=r.stdout.match(/\{[\s\S]*\}\s*$/); if(m) s=JSON.parse(m[0]); } catch {}
  console.log(JSON.stringify({group,files:files.length,tests:s.numTotalTests??null,passed:s.numPassedTests??null,failed:s.numFailedTests??(r.status===0?0:null),skipped:s.numPendingTests??null,durationMs:Date.now()-start,exit:r.status,timeout:r.error?.code==='ETIMEDOUT'}));
}
