import fs from 'node:fs';
for(const line of fs.readFileSync('.env','utf8').split('\n')){const key=line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=/)?.[1];if(key)process.env[key]='';}
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://audit:audit_local_only@127.0.0.1:5541/gaming_hub_remediation_fresh_20261003_test',SUPABASE_URL:'http://127.0.0.1:59999',SUPABASE_SERVICE_ROLE_KEY:'audit-dummy-key',SUPABASE_SECRET_KEY:'audit-dummy-key',INTERNAL_API_KEY:'isolated-audit-internal-key',API_URL:'http://127.0.0.1:59998',SOCKET_URL:'http://127.0.0.1:59997',CORS_ORIGIN:'http://localhost:5173',EMAIL_PROVIDER:'mock',REQUIRE_EMAIL_VERIFICATION:'false',COUPON_API_URL:'http://127.0.0.1:59996/api/v1',COUPON_API_KEY:'audit-dummy-key',REDIS_URL:'',LOG_LEVEL:'silent',TRUST_PROXY_HOPS:'1',TRUST_PROXY_CIDRS:'192.0.2.10/32',TOTP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')});
const {buildApp}=await import('../../apps/api/src/app');
const {prisma}=await import('@gaming-hub/db');
const app=buildApp();app.get('/__audit/client-ip',request=>({ip:request.ip}));
const response=await app.inject({url:'/__audit/client-ip',remoteAddress:'192.0.2.10',headers:{'x-forwarded-for':'198.51.100.99, 203.0.113.4'}});
const actual=response.json().ip,expected='203.0.113.4';
await app.close();await prisma.$disconnect();
fs.writeFileSync('security-reports/2026-10-03-remediation/proxy-ip-after.json',JSON.stringify({configuredTrustedHops:1,expected,actual,status:response.statusCode,pass:actual===expected},null,2));
if(actual!==expected)throw new Error('Configured proxy hop is ignored: expected '+expected+', actual '+actual);
