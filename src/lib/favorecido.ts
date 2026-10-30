/**
 * QUEM RECEBE A ORDEM (30/10/2026) — regra única, sem banco (testável em
 * tests/unidade). Antes, lista, extrato, remessa, caixa, conciliação,
 * contábil, gerencial e auditoria decidiam cada um a seu modo, e o filiado
 * (que não tem coluna na ordem) sumia em uns e derrubava outros.
 *
 * Ordem de preferência: fornecedor beneficiário → fornecedor da ordem →
 * pessoa do quadro → filiado (reembolso/custeio) → avulso gravado na ordem.
 * O documento vem do cadastro escolhido; sem ele, o avulso da ordem.
 * Quem carrega os cadastros é lib/db/ordens-favorecido.ts.
 */

export type TipoFavorecido = "fornecedor" | "usuario" | "filiado" | "avulso"

export type Favorecido = {
  tipo: TipoFavorecido
  /** id do cadastro (empresa, usuário ou filiação); null no avulso. */
  id: string | null
  nome: string
  documento: string | null
}

/** Colunas da ordem que dizem quem recebe. */
export type OrdemFavorecido = {
  id: unknown
  fornecedor_id?: unknown
  beneficiario_fornecedor_id?: unknown
  beneficiario_usuario_id?: unknown
  beneficiario_nome_avulso?: unknown
  beneficiario_doc_avulso?: unknown
  custeio_id?: unknown
}

export type CadastroFavorecido = { nome: string | null; documento: string | null }

export type FontesFavorecido = {
  empresas: Map<string, CadastroFavorecido>
  usuarios: Map<string, CadastroFavorecido>
  /** Filiado de cada ordem (pelo id da ORDEM), resolvido pelo reembolso ou custeio. */
  filiados: Map<string, CadastroFavorecido & { id: string }>
}

const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)

/** Nome da empresa como as telas do Financeiro mostram. */
export function nomeDaEmpresa(e: { empresa?: unknown; nome_fantasia?: unknown; nome_razao?: unknown }): string | null {
  return txt(e.empresa) ?? txt(e.nome_fantasia) ?? txt(e.nome_razao)
}

export function nomeDoUsuario(u: { nome_completo?: unknown; nome_guerra?: unknown }): string | null {
  return txt(u.nome_completo) ?? txt(u.nome_guerra)
}

export function escolherFavorecido(o: OrdemFavorecido, fontes: FontesFavorecido): Favorecido | null {
  const docAvulso = txt(o.beneficiario_doc_avulso)
  for (const id of [txt(o.beneficiario_fornecedor_id), txt(o.fornecedor_id)]) {
    const e = id ? fontes.empresas.get(id) : undefined
    if (id && e?.nome) return { tipo: "fornecedor", id, nome: e.nome, documento: e.documento ?? docAvulso }
  }
  const usuarioId = txt(o.beneficiario_usuario_id)
  const u = usuarioId ? fontes.usuarios.get(usuarioId) : undefined
  if (usuarioId && u?.nome) return { tipo: "usuario", id: usuarioId, nome: u.nome, documento: u.documento ?? docAvulso }
  const f = fontes.filiados.get(String(o.id))
  if (f?.nome) return { tipo: "filiado", id: f.id, nome: f.nome, documento: f.documento ?? docAvulso }
  const avulso = txt(o.beneficiario_nome_avulso)
  if (avulso) return { tipo: "avulso", id: null, nome: avulso, documento: docAvulso }
  return null
}
