import fs from 'node:fs';
import {PrismaClient} from '@gaming-hub/db';
import {validateTestDatabaseUrl} from '../../apps/api/test/databaseSafety';
const url=validateTestDatabaseUrl('postgresql://audit:audit_local_only@127.0.0.1:5541/gaming_hub_remediation_20261003_test');
const p=new PrismaClient({datasources:{db:{url}}});
const tables=await p.$queryRawUnsafe<Array<{tablename:string}>>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '_prisma%' ORDER BY tablename");
const quoted=tables.map(t=>'"public"."'+t.tablename.replaceAll('"','""')+'"');
const count=async()=>{
 const values=[];
 for(let i=0;i<quoted.length;i++){
  const [row]=await p.$queryRawUnsafe<Array<{total:bigint}>>(`SELECT count(*) AS total FROM ${quoted[i]}`);
  values.push({table:tables[i].tablename,rows:Number(row.total)});
 }
 return values;
};
const before=await count();
await p.$executeRawUnsafe(`TRUNCATE TABLE ${quoted.join(', ')} RESTART IDENTITY CASCADE`);
const after=await count();
await p.$disconnect();
if(after.some(t=>t.rows!==0))throw new Error('Disposable reset did not clear all application tables');
fs.writeFileSync('security-reports/2026-10-03-remediation/'+(process.argv[2] || 'clean-state-before-pass2.json'),JSON.stringify({host:'127.0.0.1',port:5541,database:new URL(url).pathname.slice(1),before,after,allApplicationTablesEmpty:true,migrationHistoryPreserved:true,productionDbTouched:false},null,2));
console.log('Disposable local test database reset; all application tables empty; migration history preserved.');
