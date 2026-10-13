import React, { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Smartphone, Download, QrCode, CheckCircle2, Copy, Check, ExternalLink, ShieldCheck } from 'lucide-react';
import qrcode from 'qrcode-generator';

interface AppDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  latestVersion: string;
  downloadUrl: string;
}

function buildQrSvg(url: string): { size: number; path: string } | null {
  try {
    if (!url || url.length > 4096) return null;
    const qr = qrcode(0, 'M');
    qr.addData(url, 'Byte');
    qr.make();
    const modules = qr.getModuleCount();
    const paths: string[] = [];
    for (let y = 0; y < modules; y++) {
      for (let x = 0; x < modules; x++) {
        if (qr.isDark(y, x)) paths.push(`M${x + 4},${y + 4}h1v1h-1z`);
      }
    }
    return { size: modules + 8, path: paths.join('') };
  } catch {
    return null;
  }
}

export function AppDownloadModal({
  isOpen,
  onClose,
  latestVersion,
  downloadUrl,
}: AppDownloadModalProps) {
  const [copied, setCopied] = useState(false);
  const qr = useMemo(() => buildQrSvg(downloadUrl), [downloadUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-accent-500/25">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Download Gaming Hub App
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-black font-mono rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                v{latestVersion}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
              Official Android APK • High performance gaming
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {/* Direct APK Download Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-accent-500/10 via-indigo-500/5 to-transparent border border-accent-500/20">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Verified Release • Version {latestVersion}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Full-screen gameplay, instant match notifications & zero lag.
              </p>
            </div>
          </div>

          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-bold text-sm shadow-lg shadow-accent-500/25 transition-all duration-200 active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>Download APK (v{latestVersion})</span>
          </a>
        </div>

        {/* QR Code Section for scanning from phone */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-4">
          <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-200 shrink-0">
            {qr ? (
              <svg
                viewBox={`0 0 ${qr.size} ${qr.size}`}
                className="w-28 h-28 text-slate-900"
                shapeRendering="crispEdges"
                role="img"
                aria-label={`QR Code for Gaming Hub app v${latestVersion}`}
              >
                <path d={qr.path} fill="currentColor" />
              </svg>
            ) : (
              <div className="w-28 h-28 flex items-center justify-center text-slate-400">
                <QrCode className="w-8 h-8" />
              </div>
            )}
          </div>

          <div className="space-y-1.5 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
              <QrCode className="w-3.5 h-3.5 text-indigo-500" />
              <span>Scan to install on mobile</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Open your phone’s camera to scan this QR code and immediately download the APK on your device.
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline pt-1 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-500">Link copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy download link</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3 Steps Guide */}
        <div className="p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/30 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
          <p className="font-semibold text-slate-700 dark:text-slate-300">How to install:</p>
          <div className="grid grid-cols-1 gap-1 pl-1">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
              <span>Tap Download APK or scan the QR code above.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
              <span>Open the downloaded file and allow install if prompted.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
              <span>Sign in and enjoy all multiplayer games natively!</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
