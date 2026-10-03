import json,re
from pathlib import Path
root=Path.cwd()
p=root/'security-reports/2026-10-03-readiness-8507d07'
manifest=json.loads((p/'full-api-manifest.json').read_text())
security_manifest=json.loads((root/'security-reports/2026-10-03-remediation/test-manifest.json').read_text())
security_files={name for group in ['units','auth','finance','privacy_abuse','legacyMfaProbe'] for name in security_manifest[group]}
security_files.add('src/services/__tests__/auditRemediation.test.ts')
def stats(results):
    assertions=[a for r in results for a in r['assertionResults']]
    return {'files':len(results),'tests':len(assertions),'passed':sum(a['status']=='passed' for a in assertions),'failed':sum(a['status']=='failed' for a in assertions),'skipped':sum(a['status'] in ['pending','skipped','todo'] for a in assertions)}
passes={}
for number in [1,2]:
    results=[]
    groups=json.loads((p/f'api-pass-{number}/summary.json').read_text())
    for group in manifest['groups']:
        results+=json.loads((p/f'api-pass-{number}/{group}.json').read_text())['testResults']
    relative=[str(Path(r['name']).relative_to(root/'apps/api')) for r in results]
    expected=set(sum(manifest['groups'].values(),[]))
    missing=sorted(expected-set(relative));duplicates=sorted({name for name in relative if relative.count(name)>1})
    assert not missing and not duplicates and len(relative)==manifest['discovered']
    total=stats(results)
    assert total['failed']==0 and all(g['exitCode']==0 for g in groups)
    selections={
        'security':[r for r,name in zip(results,relative) if name in security_files],
        'tournament_routes':[r for r in results if r['name'].endswith('/routes/__tests__/tournaments.test.ts')],
        'tournament_all':[r for r in results if re.search('tournament|tier',Path(r['name']).name,re.I)],
        'tier_combinations':[r for r in results if r['name'].endswith('/allGameTierCombinations.test.ts')],
        'wallet_routes':[r for r in results if r['name'].endswith('/routes/__tests__/wallet.test.ts')],
        'financial_concurrency_reconciliation_idempotency':[r for r in results if re.search('financialConcurrencyAndRecovery|financialReconciliationEngine|financialIdempotency',r['name'])],
        'privacy':[r for r in results if r['name'].endswith('/playerProfileSystem.test.ts')],
    }
    assert len(selections['security'])==len(security_files)
    passes[str(number)]={'totals':total,'missing':missing,'duplicates':duplicates,'durationSeconds':round(sum(g['durationSeconds'] for g in groups),3),'subsets':{name:stats(rows) for name,rows in selections.items()}}
    (p/f'api-pass-{number}/aggregate.json').write_text(json.dumps(passes[str(number)],indent=2))
regressions={}
for name in ['game-engine','multiplayer','web']:
    j=json.loads((p/f'{name}.json').read_text())
    regressions[name]=stats(j['testResults'])
audit=json.loads((p/'dependency-audit.json').read_text())
audit_prod=json.loads((p/'dependency-audit-production.json').read_text())
final={'commit':'8507d07234bc307096f266c35a3480e9ab125ec9','api':passes,'otherRegressions':regressions,'dependencyAll':audit['metadata']['vulnerabilities'],'dependencyProduction':audit_prod['metadata']['vulnerabilities'],'securitySubsetFiles':sorted(security_files),'productionDatabaseTouched':False}
(p/'verification-summary.json').write_text(json.dumps(final,indent=2))
print(json.dumps({k:v for k,v in final.items() if k!='securitySubsetFiles'},indent=2))
