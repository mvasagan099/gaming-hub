import { Navigate, useLocation } from 'react-router-dom';
import { parseAndValidateDeepLink } from '@gaming-hub/shared';

/** Compatibility for issued provider links; validation owns routing. */
export function AuthLinkAliasPage() {
  const location = useLocation();
  const result = parseAndValidateDeepLink(`https://app.gaminghub.com${location.pathname}${location.search}${location.hash}`);
  return <Navigate replace to={result.valid && result.target ? result.target : '/'} />;
}
