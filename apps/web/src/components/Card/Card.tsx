import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl ${className}`}>
      {children}
    </div>
  );
};
