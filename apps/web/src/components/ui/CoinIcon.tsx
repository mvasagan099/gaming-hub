import React from 'react';
import { Coins } from 'lucide-react';

export interface CoinIconProps {
  className?: string;
  size?: number | string;
}

export const CoinIcon: React.FC<CoinIconProps> = ({
  className = '',
  size = 14,
}) => {
  return (
    <Coins
      size={size}
      className={`inline-block text-amber-400 shrink-0 align-middle ${className}`}
    />
  );
};

export default CoinIcon;
