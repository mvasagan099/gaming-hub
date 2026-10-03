import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { EMAIL_HTTP_TIMEOUT_MS, sendBrevoEmail, sendSendgridEmail } from '../emailTransport';
import { requestWithdrawalOtp } from '../walletRequests';

const options={to:'private-player@example.test',subject:'Test',text:'Code 123456',html:'Code 123456'};
afterEach(()=>{ vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('HTTP email delivery safety',()=>{
  it.each(['brevo','sendgrid'])('%s aborts a hanging request and removes its timer',async provider=>{
    vi.stubEnv('BREVO_API_KEY','xkeysib-fake-test-key'); vi.stubEnv('SENDGRID_API_KEY','SG.fake-test-key');
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch',vi.fn((_url,init)=>{signal=init.signal; return new Promise(()=>{});}));
    const pending=provider==='brevo'?sendBrevoEmail(options):sendSendgridEmail(options);
    const assertion=expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(EMAIL_HTTP_TIMEOUT_MS);
    await assertion;
    expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['brevo','sendgrid'])('%s redacts echoed credentials, email and OTP in provider errors',async provider=>{
    const key=provider==='brevo'?'xkeysib-fake-test-key':'SG.fake-test-key';
    vi.stubEnv('BREVO_API_KEY',key);vi.stubEnv('SENDGRID_API_KEY',key);
    const message=`Gateway rejected ${key} for ${options.to} code 123456`;
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'rejected',message}),{status:400})));
    const error=await (provider==='brevo'?sendBrevoEmail(options):sendSendgridEmail(options)).catch(e=>e as Error);
    expect(error).toBeInstanceOf(Error);
    const text=(error as Error).message;
    expect(text).not.toContain(key);expect(text).not.toContain(options.to);expect(text).not.toContain('123456');
  });

  it('withdrawal OTP timeout invalidates the code and logs only a user identifier',async()=>{
    vi.stubEnv('EMAIL_PROVIDER','brevo');vi.stubEnv('BREVO_API_KEY','xkeysib-fake-test-key');
    const user=await prisma.user.create({data:{id:'email-timeout-user',username:'email-timeout-user',displayName:'Timeout Fixture',email:options.to,profile:{create:{}}}});
    await prisma.wallet.create({data:{userId:user.id}});
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
    const realSetTimeout=globalThis.setTimeout;
    vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback: (...args: any[]) => void,delay?: number,...args: any[])=>
      realSetTimeout(callback,delay===EMAIL_HTTP_TIMEOUT_MS?10:delay,...args)) as typeof setTimeout);
    vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));
    const pending=requestWithdrawalOtp(user.id);
    const assertion=expect(pending).rejects.toMatchObject({code:'EMAIL_DELIVERY_FAILED'});
    await assertion;
    expect(await prisma.walletOtp.count({where:{userId:user.id,consumedAt:null}})).toBe(0);
    const log=JSON.stringify(warn.mock.calls);
    expect(log).toContain(user.id);expect(log).not.toContain(options.to);expect(log).not.toContain('xkeysib-');
  });

  it('redacts a non-JSON Brevo error status as well as JSON error bodies',async()=>{
    const key='xkeysib-fake-test-key';
    vi.stubEnv('BREVO_API_KEY',key);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('not JSON',{
      status:400,statusText:`Rejected ${options.to} ${key} code 123456`,
    })));
    const error=await sendBrevoEmail(options).catch(e=>e as Error);
    expect(error).toBeInstanceOf(Error);
    for(const privateValue of [key,options.to,'123456'])expect((error as Error).message).not.toContain(privateValue);
  });
});
