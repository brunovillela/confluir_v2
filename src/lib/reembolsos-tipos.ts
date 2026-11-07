/**
 * Tipo do reembolso a filiado (28/10/2026): a natureza que antes só existia no
 * texto da justificativa. O histórico foi classificado pela justificativa na
 * migração 20261028084404 (mesmas palavras de `tipoPelaJustificativa`).
 * Equipamento e assistência pelo serviço social entraram em 07/11/2026
 * (migração 20261107180006).
 */
export const TIPOS_REEMBOLSO = [
  { valor: "desconto_greve", rotulo: "Desconto de greve" },
  { valor: "despesa_atividade", rotulo: "Despesa em atividade sindical" },
  { valor: "cobranca_indevida", rotulo: "Cobrança indevida" },
  { valor: "equipamento", rotulo: "Equipamento ou material para a entidade" },
  { valor: "assistencia_social", rotulo: "Assistência (serviço social)" },
  { valor: "outro", rotulo: "Outro" },
] as const

export type TipoReembolso = (typeof TIPOS_REEMBOLSO)[number]["valor"]

export function ehTipoReembolso(v: unknown): v is TipoReembolso {
  return TIPOS_REEMBOLSO.some((t) => t.valor === v)
}

export function rotuloTipoReembolso(v: string | null | undefined): string {
  return TIPOS_REEMBOLSO.find((t) => t.valor === v)?.rotulo ?? "Outro"
}

/**
 * Sugestão de tipo pelo texto — a classificação usada no histórico, mais
 * assistência e equipamento (07/11/2026), conferidas antes das despesas em
 * atividade (senão "atendimento" ou "manutenção do notebook" viraria despesa).
 */
export function tipoPelaJustificativa(justificativa: string | null | undefined): TipoReembolso {
  const t = (justificativa ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
  if ((t.includes("desconto") && t.includes("greve")) || /^reembolsos? de greve/.test(t)) return "desconto_greve"
  if (/(indevid|duplicidade|contribuicao assistencial|mensalidade|cobranc|estorno)/.test(t)) return "cobranca_indevida"
  if (/(servico social|assistencia social|assistente social|medico do trabalho)/.test(t)) return "assistencia_social"
  if (/(notebook|notbook|note book|celular|smartphone|computador|impressora|tablet|equipamento)/.test(t)) return "equipamento"
  if (
    /(aliment|janta|almoco|lanche|transporte|uber|passage|diaria|despesa|deslocamento|hosped|combustivel|pedagio|estacionamento|congresso|seminario|audiencia|plenaria|vigilia|trancaco|reuniao|encontro|confup|ato |ato$|greve|plantao|visita|vinda|ida |gasolina|abastec|translad|taxi|hotel|carro|locacao|assembleia|atividade|viage|palestra|aeroporto|congre)/.test(
      t
    )
  ) {
    return "despesa_atividade"
  }
  return "outro"
}
