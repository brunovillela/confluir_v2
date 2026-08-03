/**
 * Valores reais de `filiacoes.filiacao_condicao` — campo central de status
 * do filiado (equivalente ao option set "Filiação Condição" do Bubble).
 * Registros antigos podem ter null (sem condição registrada).
 */
export const FILIACAO_CONDICOES = [
  "Ativo",
  "Inativo",
  "Aguarda ficha assinada",
  "Filiação aguarda fonte",
  "Filiação não informada à fonte",
  "Desfiliação aguarda fonte",
  "Desfiliação não informada à fonte",
  "Falecido",
  "Excluído(a) do quadro associativo",
] as const

export type FiliacaoCondicao = (typeof FILIACAO_CONDICOES)[number]

/**
 * Grupos de condições usados nos indicadores do dashboard — o filtro
 * `condicao` da listagem aceita a chave do grupo além dos valores acima.
 */
export const GRUPOS_CONDICAO: Record<
  string,
  { rotulo: string; condicoes: FiliacaoCondicao[] }
> = {
  andamento_filiacao: {
    rotulo: "Filiação em andamento",
    condicoes: ["Filiação aguarda fonte", "Filiação não informada à fonte"],
  },
  andamento_desfiliacao: {
    rotulo: "Desfiliação em andamento",
    condicoes: ["Desfiliação aguarda fonte", "Desfiliação não informada à fonte"],
  },
}
