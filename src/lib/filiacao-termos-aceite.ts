/**
 * Uma versão de termo legal já foi aceita? Separado de db/filiacao-termos.ts
 * (server-only) para poder ser testado: tests/unidade/termo-aceite.spec.ts.
 *
 * O aceite vale para o texto exato: é isso que dá validade ao consentimento.
 * Por isso versão aceita não se edita (decisão do usuário, 04/11/2026): muda-se
 * com uma versão nova.
 *
 * Três lugares guardam o aceite, porque ele nasce por caminhos diferentes:
 * o cadastro (`filiacoes`), a ficha pública (`filiacao_solicitacoes`) e o
 * registro de cada aceite (`filiacao_tl_aceites`, que não tem chave estrangeira
 * para a versão).
 *
 * Na dúvida, trava: erro ao consultar conta como aceita, porque reescrever um
 * texto aceito é pior do que recusar uma correção.
 */
export type TipoTermoAceite = "lgpd" | "desconto"

export type FiltroAceite = {
  tabela: "filiacoes" | "filiacao_solicitacoes" | "filiacao_tl_aceites"
  iguais: Record<string, string>
}

/** Onde procurar o aceite desta versão. */
export function filtrosDeAceite(
  tipo: TipoTermoAceite,
  termoId: string,
  empId: string
): FiltroAceite[] {
  const coluna = tipo === "lgpd" ? "tl_lgpd_id" : "tl_desconto_id"
  const base = { emp_proprietaria_id: empId }
  return [
    { tabela: "filiacoes", iguais: { ...base, [coluna]: termoId } },
    { tabela: "filiacao_solicitacoes", iguais: { ...base, [coluna]: termoId } },
    { tabela: "filiacao_tl_aceites", iguais: { ...base, tipo, termo_id: termoId } },
  ]
}

/**
 * `existe` responde se há alguma linha para o filtro, ou lança em caso de erro.
 */
export async function termoFoiAceito(
  filtros: FiltroAceite[],
  existe: (filtro: FiltroAceite) => Promise<boolean>
): Promise<boolean> {
  const respostas = await Promise.all(
    filtros.map((f) => existe(f).catch(() => true))
  )
  return respostas.some(Boolean)
}

export const MOTIVO_TERMO_ACEITO =
  "Esta versão já foi aceita e não pode ser alterada. Para mudar o texto, crie uma nova versão."
