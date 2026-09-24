import type { ReactNode } from 'react';

/**
 * Lugar reservado para as abas que ainda não têm tela (docs/telas-amador.md,
 * etapas 4 e 5). A aba já existe para a navegação poder ser sentida; o
 * conteúdo chega na etapa dela. `children` fica abaixo do aviso, para o que
 * já precisa morar ali antes da tela completa.
 */
export function EmBrevePage({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top pt-6 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </header>
      <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
        <p className="text-[15px] font-semibold text-ink-50">Em breve</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">{text}</p>
      </div>
      {children}
    </div>
  );
}
