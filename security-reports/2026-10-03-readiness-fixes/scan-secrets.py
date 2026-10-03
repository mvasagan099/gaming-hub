import json, os, re, subprocess
from pathlib import Path
root = Path.cwd()
out = root / 'security-reports/2026-10-03-readiness-fixes'
values = {}
for line in (root / '.env').read_text().splitlines():
    match = re.match(r'^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$', line)
    if not match:
        continue
    key, value = match.groups()
    value = value.strip('\"\'')
    if re.search(r'PASSWORD|SECRET|SERVICE_ROLE|API_KEY|SMTP_PASS|DATABASE_URL|REDIS_URL|TOTP_ENCRYPTION_KEY', key) and len(value) >= 12 and not re.search(r'dummy|example|placeholder|your[-_]|test[-_]key', value, re.I):
        values[key] = value
paths = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')
paths += [str(p.relative_to(root)) for p in (root / 'apps/web/dist').rglob('*') if p.is_file()]
findings = []
scanned = 0
for name in sorted(set(paths)):
    if not name or name.endswith('.env'):
        continue
    p = root / name
    if not p.is_file():
        continue
    data = p.read_bytes()
    if b'\0' in data[:8192]:
        continue
    scanned += 1
    for key, value in values.items():
        if value.encode() in data:
            findings.append({'type': key, 'location': name})
history = subprocess.check_output(['git', 'log', '-100', '-p', '--all'], stderr=subprocess.DEVNULL)
history_findings = [{'type': key, 'location': 'last 100 commits (exact configured value match)'} for key, value in values.items() if value.encode() in history]
result = {'method': 'Exact configured private-value match; not a comprehensive secret detector', 'textFilesScanned': scanned, 'configuredSecretTypesCompared': sorted(values), 'currentMatches': findings, 'historyCommitsRequested': 100, 'historyMatches': history_findings, 'ignoredLocalEnv': subprocess.run(['git', 'check-ignore', '.env'], capture_output=True).returncode == 0}
(out / 'secret-scan.json').write_text(json.dumps(result, indent=2))
print(json.dumps({'textFilesScanned': scanned, 'currentMatches': len(findings), 'historyMatches': len(history_findings), 'ignoredLocalEnv': result['ignoredLocalEnv']}))
