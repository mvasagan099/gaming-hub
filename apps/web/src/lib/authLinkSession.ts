import { supabase } from '../services/supabase';
import type { Session } from '@supabase/supabase-js';

let pendingExchange: { code: string; promise: Promise<Session | null> } | null = null;

/** The SDK consumes redirect tokens during initialization, before lazy pages mount. */
export async function getAuthLinkSession(code: string | null): Promise<Session | null> {
  const initialized = await supabase.auth.initialize();
  if (initialized.error) throw initialized.error;

  const currentUrl = new URL(window.location.href);
  if (code && currentUrl.searchParams.get('code') === code) {
    // A native/in-app redirect can arrive after SDK initialization. Exchange
    // that code once, including when StrictMode replays the page effect.
    if (pendingExchange?.code === code) return pendingExchange.promise;
    const promise = (async () => {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      if (!data.session) throw new Error('Authentication session could not be established');
      const url = new URL(window.location.href);
      if (url.searchParams.get('code') === code) {
        url.searchParams.delete('code');
        window.history.replaceState(window.history.state, '', url.toString());
      }
      return data.session;
    })();
    pendingExchange = { code, promise };
    try { return await promise; }
    finally { if (pendingExchange?.promise === promise) pendingExchange = null; }
  }

  // If initialization removed the code/hash, use the session it already made.
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
