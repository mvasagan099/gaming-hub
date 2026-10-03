import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '../../packages/db/src/generated/client/index.js';
import {schemaGuardSql} from '../../packages/db/prisma/schema-guards/build-guard.js';
const dir='security-reports/2026-10-03-readiness-8507d07';
const migration=JSON.parse(fs.readFileSync(dir+'/migration-summary.json'));
const source=migration.databases.upgrade;
if(!/^gaming_hub_readiness_upgrade_\d+_test$/.test(source))throw new Error('Unsafe source');
const base='postgresql://audit:audit_local_only@127.0.0.1:5541/';
const name=`gaming_hub_readiness_restore_${Date.now()}_test`;
const maintenance=new PrismaClient({datasources:{db:{url:base+'postgres'}}});
await maintenance.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
await maintenance.$disconnect();
const started=Date.now();
const dump=spawnSync('docker',['exec','gaming-hub-security-audit-20261003','pg_dump','-U','audit','-d',source,'--format=custom'],{maxBuffer:32*1024*1024});
if(dump.status!==0)throw new Error('Local backup failed');
const restore=spawnSync('docker',['exec','-i','gaming-hub-security-audit-20261003','pg_restore','-U','audit','-d',name,'--exit-on-error'],{input:dump.stdout,maxBuffer:32*1024*1024});
if(restore.status!==0)throw new Error('Local restore failed');
const seconds=(Date.now()-started)/1000;
const p=new PrismaClient({datasources:{db:{url:base+name}}});
const before=new PrismaClient({datasources:{db:{url:base+source}}});
async function snapshot(client){
 const tables=await client.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
 const counts={};
 for(const table of tables){const rows=await client.$queryRawUnsafe(`SELECT count(*)::integer AS count FROM public."${table.tablename.replaceAll('"','""')}"`);counts[table.tablename]=rows[0].count;}
 const wallet=await client.wallet.findUniqueOrThrow({where:{userId:'security-upgrade-preservation-test-user'}});
 const constraints=await client.$queryRawUnsafe("SELECT conname,pg_get_constraintdef(oid) AS definition,convalidated FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname,definition");
 return {counts,wallet:{main:wallet.balance,bonus:wallet.bonusBalance,locked:wallet.lockedBalance},constraints};
}
const sourceSnapshot=await snapshot(before), restoredSnapshot=await snapshot(p);
if(JSON.stringify(sourceSnapshot)!==JSON.stringify(restoredSnapshot))throw new Error('Restored records/constraints differ');
await p.$executeRawUnsafe(schemaGuardSql(true));
const probes=[
 ['type','ALTER TABLE "AffiliateCommission" ALTER COLUMN "sourceType" TYPE varchar(128)'],
 ['nullability','ALTER TABLE "AffiliateCommission" ALTER COLUMN "sourceType" DROP NOT NULL'],
 ['default','ALTER TABLE "AffiliateCommission" ALTER COLUMN "sourceType" SET DEFAULT \'unexpected\''],
 ['primary-key','ALTER TABLE "AffiliateCommission" DROP CONSTRAINT "AffiliateCommission_pkey"'],
 ['foreign-key','ALTER TABLE "AffiliateCommission" DROP CONSTRAINT "AffiliateCommission_referrerId_fkey"'],
 ['unique-index','DROP INDEX "AffiliateCommission_sourceType_sourceId_key"'],
 ['nonunique-index','DROP INDEX "AffiliateCommission_status_idx"'],
];
const results=[];
for(const [label,sql] of probes){
 let detected=false;
 try{await p.$transaction(async tx=>{await tx.$executeRawUnsafe(sql);await tx.$executeRawUnsafe(schemaGuardSql(true));throw new Error('Guard accepted drift');});}
 catch(error){detected=String(error).includes('Schema drift:');}
 results.push({label,driftRejected:detected});
 if(!detected)throw new Error(label+' drift was not rejected');
 await p.$executeRawUnsafe(schemaGuardSql(true));
}
fs.writeFileSync(dir+'/restore-drift-summary.json',JSON.stringify({scope:'Synthetic disposable fixture only; not a production backup',host:'127.0.0.1',port:5541,sourceDatabase:source,restoredDatabase:name,restoreSeconds:seconds,backupBytes:dump.stdout.length,allTableCountsMatch:true,allConstraintDefinitionsMatch:true,wallet:restoredSnapshot.wallet,driftProbes:results,productionDbTouched:false},null,2));
await p.$disconnect();await before.$disconnect();
console.log(JSON.stringify({restoreSeconds:seconds,allTableCountsMatch:true,walletPreserved:true,driftProbes:results}));
