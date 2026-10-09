export function isRecoveryLocation(location: { pathname: string; search: string; hash: string }): boolean {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  return location.pathname === '/reset-password' || location.pathname === '/auth/reset-password' ||
    query.get('type') === 'recovery' || hash.get('type') === 'recovery' || query.get('next') === '/reset-password';
}
