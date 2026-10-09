import { supabase } from '../services/supabase';
import { apiClient } from '../services/api/client';

export async function completePasswordRecovery(password: string, checkpoint: { passwordSaved: boolean }, onSaved: () => void) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('Recovery session is missing. Request a new reset email.');
  if (!checkpoint.passwordSaved) {
    const updated = await supabase.auth.updateUser({ password });
    if (updated.error) throw updated.error;
    checkpoint.passwordSaved = true;
    onSaved();
  }
  // Explicit recovery credential; never refresh it into a normal Gaming Hub login.
  await apiClient.post('/auth/logout-all', {}, data.session.access_token);
  const logout = await supabase.auth.signOut({ scope: 'global' });
  if (logout.error) throw logout.error;
}
