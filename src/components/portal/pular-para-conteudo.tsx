/**
 * "Pular para o conteúdo" (A127): primeiro foco da página. Fica fora da tela
 * até receber o foco pelo teclado e leva ao <main id={alvo}> (que precisa de
 * tabIndex={-1}), poupando quem usa teclado ou leitor de tela de atravessar
 * menu e cabeçalho em toda página. Serve a qualquer casca, não só ao portal.
 */
export function PularParaConteudo({ alvo = "conteudo" }: { alvo?: string }) {
  return (
    <a
      href={`#${alvo}`}
      className="bg-primary text-primary-foreground focus-visible:ring-ring/50 fixed top-2 left-2 z-(--z-toast) inline-flex min-h-11 -translate-y-20 items-center rounded-lg px-4 text-sm font-medium shadow-md outline-none focus:translate-y-0 focus-visible:ring-3 motion-safe:transition-transform print:hidden"
    >
      Pular para o conteúdo
    </a>
  )
}
