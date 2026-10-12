import { useEffect, useState } from 'react';
import { useTheme } from '../contexts/ThemeProvider';
import { lightThumbnail } from './thumbnails/lightThumbnail';

export function GameThumbnail({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const { effectiveTheme } = useTheme();
  const [light, setLight] = useState<{ src: string; url: string } | null>(null);
  useEffect(() => {
    if (effectiveTheme !== 'light') return;
    let current = true;
    void lightThumbnail(src).then(url => { if (current) setLight({ src, url }); })
      .catch(() => { if (current) setLight({ src, url: src }); });
    return () => { current = false; };
  }, [src, effectiveTheme]);
  const ready = light?.src === src;
  return <img src={effectiveTheme === 'light' && ready ? light.url : src} alt={alt}
    className={className} style={{ visibility: effectiveTheme === 'light' && !ready ? 'hidden' : undefined }} />;
}
