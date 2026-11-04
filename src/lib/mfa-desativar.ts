/**
 * Desativar a verificação em duas etapas: a regra, separada da action para
 * poder ser testada (tests/unidade/mfa-desativar.spec.ts).
 *
 * Sessão verificada não basta (decisão do usuário, 04/11/2026): uma sessão
 * aberta e esquecida não pode remover a proteção. O código é conferido na hora
 * e o erro conta para o mesmo bloqueio do login por código. Só depois de o
 * código confirmar é que o fator sai.
 */
export type DepsDesativar2FA = {
  /** Mensagem de bloqueio por excesso de tentativas, ou null. */
  bloqueio: () => Promise<string | null>
  /** Confere o código do aplicativo. `ok: false` = código recusado. */
  verificar: (fatorId: string, codigo: string) => Promise<{ ok: boolean }>
  registrarFalha: () => Promise<void>
  limparFalhas: () => Promise<void>
  /** Remove o fator. `ok: false` = o Supabase recusou. */
  remover: (fatorId: string) => Promise<{ ok: boolean }>
}

export async function desativarFatorComCodigo(
  deps: DepsDesativar2FA,
  fatorId: string,
  codigoDigitado: string
): Promise<{ erro?: string }> {
  const codigo = codigoDigitado.replace(/\D/g, "")
  if (!fatorId) return { erro: "Fator inválido." }
  if (codigo.length !== 6) return { erro: "Digite o código de 6 dígitos." }

  const bloqueio = await deps.bloqueio()
  if (bloqueio) return { erro: bloqueio }

  const { ok } = await deps.verificar(fatorId, codigo)
  if (!ok) {
    await deps.registrarFalha()
    return { erro: "Código inválido ou expirado. Confira a hora do celular e tente de novo." }
  }
  await deps.limparFalhas()

  const removido = await deps.remover(fatorId)
  return removido.ok ? {} : { erro: "Não foi possível desativar. Tente de novo." }
}
