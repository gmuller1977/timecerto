import type { ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';

/** Só no modo amador: o que é da pelada e não do time (ex.: avisos do jogo) */
export function SoNaPelada({ children }: { children: ReactNode }) {
  const mode = useAppStore((s) => s.mode) ?? 'amador';
  return mode === 'amador' ? <>{children}</> : null;
}
