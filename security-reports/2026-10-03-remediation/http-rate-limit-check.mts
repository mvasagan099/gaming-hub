import fs from 'node:fs';
process.env.DATABASE_URL = 'postgresql://audit:audit_local_only@127.0.0.1:5541/gaming_hub_remediation_fresh_20261003_test';
const {default: Fastify} = await import('fastify');
const {default: rateLimit} = await import('@fastify/rate-limit');
const {prisma} = await import('@gaming-hub/db');
const {PostgresRateLimitStore} = await import('../../apps/api/src/services/sharedRateLimit');
const key=crypto.randomUUID();
async function instance(){
  const app=Fastify();
  await app.register(rateLimit,{store:PostgresRateLimitStore,max:2,timeWindow:60000,keyGenerator:()=>key,skipOnError:false});
  app.get('/check',()=>({ok:true}));
  return app;
}
const a=await instance(),b=await instance();
const statuses=[(await a.inject('/check')).statusCode,(await b.inject('/check')).statusCode,(await a.inject('/check')).statusCode];
await a.close();await b.close();
const c=await instance();
const restarted=(await c.inject('/check')).statusCode;
await prisma.rateLimitWindow.updateMany({data:{expiresAt:new Date(0)}});
const expired=(await c.inject('/check')).statusCode;
const query=prisma.$queryRaw;
prisma.$queryRaw=(()=>Promise.reject(new Error('controlled database outage'))) as any;
const outage=(await c.inject('/check')).statusCode;
prisma.$queryRaw=query;
await c.close();await prisma.$disconnect();
const success=JSON.stringify(statuses)==='[200,200,429]' && restarted===429 && expired===200 && outage===500;
fs.writeFileSync('security-reports/2026-10-03-remediation/http-rate-limit-check.json',JSON.stringify({statuses,restarted,expired,outage,success,productionDbTouched:false},null,2));
if(!success)throw new Error('HTTP shared-limit verification failed');
console.log('Two HTTP instances share a limit; restart retains it; expiry resets it; outage fails closed.');
