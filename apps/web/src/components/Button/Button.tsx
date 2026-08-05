import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'amber';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}) => {
  const variantStyles = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30',
    amber: 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25 font-black',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-xl',
    md: 'px-4 py-2.5 text-xs font-bold rounded-2xl',
    lg: 'px-6 py-3.5 text-sm font-extrabold rounded-2xl',
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 transition-all transform active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-lg ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
