import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** The enrollment URI contains a secret: encode it entirely inside the browser. */
export function buildAuthenticatorQr(authUrl: string): { size: number; path: string } | null {
  try {
    if (authUrl.length > 4096) return null;
    const uri = new URL(authUrl);
    if (uri.protocol !== 'otpauth:' || uri.hostname !== 'totp' || !uri.searchParams.get('secret')) return null;
    const qr = qrcode(0, 'M');
    qr.addData(uri.toString(), 'Byte');
    qr.make();
    const modules = qr.getModuleCount();
    // Four empty modules on every side are needed for reliable camera scanning.
    const paths: string[] = [];
    for (let y = 0; y < modules; y++) {
      for (let x = 0; x < modules; x++) {
        if (qr.isDark(y, x)) paths.push(`M${x + 4},${y + 4}h1v1h-1z`);
      }
    }
    return { size: modules + 8, path: paths.join('') };
  } catch {
    // Keep the existing manual-key option; never fall back to a remote encoder.
    return null;
  }
}

export function AuthenticatorQr({ authUrl, className }: { authUrl: string; className?: string }) {
  const qr = useMemo(() => buildAuthenticatorQr(authUrl), [authUrl]);
  if (!qr) return <p role="status">QR unavailable. Enter the secret key manually.</p>;
  return (
    <svg className={className} viewBox={`0 0 ${qr.size} ${qr.size}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="2FA QR Code" shapeRendering="crispEdges">
      <rect width={qr.size} height={qr.size} fill="white" />
      <path d={qr.path} fill="black" />
    </svg>
  );
}
