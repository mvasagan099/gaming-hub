import React from 'react';

export const SettingsPage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="glass-panel p-8 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-6 transition-colors duration-300">
        <h2 className="text-xl font-black text-slate-900 dark:text-white transition-colors duration-300">Audio & Preference Settings</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white transition-colors duration-300">Sound Effects</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-300">Play in-game sounds and dice audio</p>
            </div>
            <input type="checkbox" defaultChecked className="accent-indigo-500 w-5 h-5 cursor-pointer" />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white transition-colors duration-300">Background Music</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-300">Ambient menu & match audio</p>
            </div>
            <input type="checkbox" defaultChecked className="accent-indigo-500 w-5 h-5 cursor-pointer" />
          </div>
        </div>
      </div>
    </div>
  );
};
