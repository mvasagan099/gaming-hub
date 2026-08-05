import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ icon, className = '', ...props }) => {
  return (
    <div className="relative w-full">
      {icon && <div className="absolute left-3.5 top-3 text-slate-500">{icon}</div>}
      <input
        className={`w-full bg-slate-900 text-xs text-white rounded-xl py-2.5 border border-slate-800 focus:outline-none focus:border-indigo-500 shadow-inner ${
          icon ? 'pl-10 pr-4' : 'px-4'
        } ${className}`}
        {...props}
      />
    </div>
  );
};
