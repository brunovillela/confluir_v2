/**
 * Ponte entre o formulário do ofício (oficio-form.tsx) e as ações da mesma
 * página que usam a versão SALVA — enviar para assinatura e emitir. Sem ela,
 * quem altera o texto e clica em Enviar sem salvar manda a versão antiga.
 *
 * Só client; uma página tem um formulário de ofício por vez.
 */

type FormularioOficio = {
  /** Há diferença entre a tela e o que foi salvo? */
  alterado: () => boolean
  /** Salva o formulário (o mesmo que clicar em "Salvar alterações"). */
  salvar: () => void
}

let atual: FormularioOficio | null = null

export function registrarFormularioOficio(f: FormularioOficio): () => void {
  atual = f
  return () => {
    if (atual === f) atual = null
  }
}

export function formularioOficioAlterado(): boolean {
  return atual?.alterado() ?? false
}

export function salvarFormularioOficio(): void {
  atual?.salvar()
}
