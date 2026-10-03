// Regressions for financial/authentication defects reproduced during the security audit.
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { prisma } from '@gaming-hub/db';
import { resetTestDatabase } from '../../../test/db';
import { createTestUser } from '../../../test/helpers';
import { authenticate, optionalAuthenticate } from '../../plugins/authenticate';
import { recordLoginSession, hashToken } from '../sessions';
import { PlayerProfileService } from '../playerProfileService';
import { adminTournamentsRoutes } from '../../routes/adminTournaments';
import * as engine from '../tournamentEngine';
import * as notifications from '../notifications';
import { createWithdrawalRequest } from '../walletRequests';
import { applyTransaction, reconcileUnconfirmedTransfer, reconcileAllUnconfirmedTransfers } from '../wallet';
import { CouponVaultService } from '../couponVaultService';
import { WalletTransactionService } from '../walletTransactionService';
import { resetSettingsCache } from '../settings';

beforeEach(async()=> { await resetTestDatabase(); resetSettingsCache(); });
afterEach(()=>vi.restoreAllMocks());
function req(token:string){return {headers:{authorization:`Bearer ${token}`},method:'GET',url:'/api/users/me/profile',ip:'127.0.0.1',log:{warn:vi.fn()}} as any;}
async function funded(){
  const user=await createTestUser();
  await prisma.profile.update({where:{userId:user.id},data:{twoFactorEnabled:true}});
  await prisma.$transaction(tx=>WalletTransactionService.createCredit(tx,{userId:user.id,amount:1000,referenceType:'ADMIN',referenceId:crypto.randomUUID()}));
  return user;
}
async function held(fee=0){
  const user=await funded();const txid=crypto.randomUUID();
  await prisma.$transaction(async tx=>{
    await tx.walletRequest.create({data:{id:txid,userId:user.id,kind:'WITHDRAWAL',amount:100,fee,status:'PENDING',method:'COUPONVAULT',note:txid,externalTransferId:txid,adminNote:'UNCONFIRMED_HOLD'}});
    await applyTransaction(tx,user.id,-(100+fee),'WITHDRAWAL',txid,{},'MAIN');
  });
  return {user,txid};
}
describe('Audit negative security probes',()=>{
  it('optional authentication must reject a revoked session',async()=>{
    const u=await createTestUser();await recordLoginSession({userId:u.id,token:u.token,ip:'127.0.0.1',userAgent:'audit'});
    await prisma.loginSession.update({where:{tokenHash:hashToken(u.token)},data:{revokedAt:new Date()}});
    await expect(authenticate(req(u.token),{} as any)).rejects.toMatchObject({code:'SESSION_REVOKED'});
    const r=req(u.token);await optionalAuthenticate(r,{} as any);
    expect(r.user).toBeUndefined();
  });
  it('MFA-pending admin must not see another private profile through optional auth',async()=>{
    const admin=await createTestUser({role:'ADMIN'});const target=await createTestUser();
    await prisma.profile.update({where:{userId:admin.id},data:{twoFactorEnabled:true}});
    await prisma.profile.update({where:{userId:target.id},data:{wins:3}});
    await PlayerProfileService.setProfilePrivacy(target.id,true);
    await recordLoginSession({userId:admin.id,token:admin.token,ip:'127.0.0.1',userAgent:'audit'});
    await expect(authenticate(req(admin.token),{} as any)).rejects.toMatchObject({code:'MFA_PENDING'});
    const r=req(admin.token);await optionalAuthenticate(r,{} as any);
    const profile=await PlayerProfileService.getPublicProfile(target.id,r.user?.id,r.user?.role==='ADMIN');
    expect(profile.wins).toBe(0);
  });
  it('tournament cancellation/refund route must deny admin without enrolled MFA',async()=>{
    const admin=await createTestUser({role:'ADMIN'});
    const cancel=vi.spyOn(engine,'cancelTournamentWithRefunds').mockResolvedValue(undefined as any);
    const app=Fastify();await app.register(adminTournamentsRoutes);
    try {
      const response=await app.inject({method:'POST',url:'/api/admin/tournaments/audit-tournament/cancel',headers:{authorization:`Bearer ${admin.token}`},payload:{reason:'audit'}});
      expect({status:response.statusCode,financialServiceCalls:cancel.mock.calls.length}).toEqual({status:403,financialServiceCalls:0});
    } finally { await app.close(); }
  });
  it('route withdrawal timeout must be discoverable by its returned request ID',async()=>{
    const u=await funded();vi.spyOn(CouponVaultService,'transferToCouponWallet').mockRejectedValue(Object.assign(new Error('controlled timeout'),{isTimeout:true}));
    await expect(createWithdrawalRequest(u.id,100)).rejects.toMatchObject({code:'COUPON_TRANSFER_TIMEOUT'});
    const r=await prisma.walletRequest.findFirstOrThrow({where:{userId:u.id}});
    vi.spyOn(CouponVaultService,'checkTransferStatus').mockResolvedValue({success:true,processed:true,status:'SUCCESS'});
    await expect(reconcileUnconfirmedTransfer(r.id)).resolves.toMatchObject({resolution:'COMPLETED'});
  });
  it('batch reconciliation must query a held route-created withdrawal',async()=>{
    const u=await funded();vi.spyOn(CouponVaultService,'transferToCouponWallet').mockRejectedValue(Object.assign(new Error('controlled timeout'),{isTimeout:true}));
    await createWithdrawalRequest(u.id,100).catch(()=>undefined);
    const check=vi.spyOn(CouponVaultService,'checkTransferStatus').mockResolvedValue({success:true,processed:true,status:'SUCCESS'});
    const result=await reconcileAllUnconfirmedTransfers();
    expect({completed:result.completed,queries:check.mock.calls.length}).toEqual({completed:1,queries:1});
  });
  it('provider PENDING/unknown status must remain held without refund',async()=>{
    const {user,txid}=await held();vi.spyOn(CouponVaultService,'checkTransferStatus').mockResolvedValue({success:true,processed:false,status:'PENDING'});
    const result=await reconcileUnconfirmedTransfer(txid);
    const w=await prisma.wallet.findUniqueOrThrow({where:{userId:user.id}});
    expect({resolution:result.resolution,balance:w.balance}).toEqual({resolution:'HELD',balance:900});
  });
  it('definitive failure reconciliation must restore principal plus charged fee',async()=>{
    const {user,txid}=await held(10);vi.spyOn(CouponVaultService,'checkTransferStatus').mockResolvedValue({success:true,processed:false,status:'NOT_FOUND'});
    await reconcileUnconfirmedTransfer(txid);
    expect((await prisma.wallet.findUniqueOrThrow({where:{userId:user.id}})).balance).toBe(1000);
  });
  it('post-transfer notification failure must never refund a successful external transfer',async()=>{
    const u=await funded();const transfer=vi.spyOn(CouponVaultService,'transferToCouponWallet').mockResolvedValue({success:true} as any);
    vi.spyOn(notifications,'createNotification').mockRejectedValue(new Error('controlled notification outage'));
    await createWithdrawalRequest(u.id,100).catch(()=>undefined);
    const w=await prisma.wallet.findUniqueOrThrow({where:{userId:u.id}});
    const r=await prisma.walletRequest.findFirstOrThrow({where:{userId:u.id}});
    expect({externalCalls:transfer.mock.calls.length,balance:w.balance,status:r.adminNote}).toEqual({externalCalls:1,balance:900,status:'COMPLETED'});
  });
  it('production email verification must default to enabled when flag is omitted',async()=>{
    const previous={...process.env};
    try {
      process.env.NODE_ENV='production';delete process.env.REQUIRE_EMAIL_VERIFICATION;
      process.env.EMAIL_PROVIDER='brevo';process.env.BREVO_API_KEY='audit-dummy-key';
      process.env.COUPON_API_URL='https://coupon-audit.example/api/v1';
      vi.resetModules();vi.doMock('dotenv',()=>({default:{config:()=>({})}}));
      const {env}=await import('../../env');
      expect(env.requireEmailVerification).toBe(true);
    } finally {
      for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];
      Object.assign(process.env,previous);vi.doUnmock('dotenv');
    }
  });
});
