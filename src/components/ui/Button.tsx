import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const variants = {
  primary:
    'bg-brand-500 text-ink-950 font-semibold hover:bg-brand-400 active:bg-brand-600 disabled:bg-ink-700 disabled:text-ink-400',
  secondary:
    'bg-ink-800 text-ink-100 hover:bg-ink-700 active:bg-ink-800 border border-ink-700',
  ghost: 'text-ink-300 hover:text-ink-50 hover:bg-ink-800',
  danger: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30',
};

const sizes = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-11 px-4 text-[15px] rounded-xl',
  lg: 'h-14 px-6 text-base rounded-2xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-colors select-none disabled:cursor-not-allowed active:scale-[0.98]',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
