/**
 * Chaves de permissão dos cupons de hospedagem.
 *
 * Quem emite cupom é o filiado pela área do filiado (desenvolvimento futuro)
 * e o pessoal da filiação pela sua área — por isso as chaves de filiação
 * entram aqui, além das do módulo Hospedagem (ver entrada oculta
 * "Cupons de hospedagem" em src/lib/permissoes.ts).
 */

export const CHAVE_VER_CUPONS = "filiacao_hospedagens"
export const CHAVES_VER_CUPONS_ALT = [
  "filiacao_hospedagens_gestao",
  "filiacao_hospedagens_edicao",
  "filiacao_gestao",
  "filiacao_filiados",
]

export const CHAVE_EMITIR_CUPOM = "filiacao_hospedagens_edicao"
export const CHAVES_EMITIR_CUPOM_ALT = [
  "filiacao_hospedagens_gestao",
  "filiacao_gestao",
]
