/**
 * Seções dos relatórios da apuração (sem "server-only": o formulário do
 * relatório completo, no cliente, monta as caixas a partir daqui).
 */

export const SECOES_RELATORIO = [
  { chave: "informacoes", rotulo: "Informações da assembleia", dica: "Campanha, rodada, período, modalidade, sala virtual." },
  { chave: "comparecimento", rotulo: "Comparecimento", dica: "Aptos, votantes, ausentes e participação." },
  { chave: "resultado", rotulo: "Resultado por pergunta", dica: "Votos por opção, com branco, nulo e porcentagem." },
  { chave: "perguntas", rotulo: "Perguntas e opções", dica: "A cédula como foi apresentada ao eleitor." },
  { chave: "votantes", rotulo: "Relação dos votantes", dica: "Nome, CPF, matrícula, canal e horário do voto." },
  { chave: "em_separado", rotulo: "Votos em separado", dica: "Quantos foram deferidos, indeferidos ou estão pendentes." },
  { chave: "urnas", rotulo: "Comparecimento por urna", dica: "Só nas assembleias híbridas." },
] as const

export type SecaoRelatorio = (typeof SECOES_RELATORIO)[number]["chave"]

export const TIPOS_RELATORIO = ["votantes", "resultado", "completo"] as const
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number]

/** Seções de cada relatório pronto; o completo usa as escolhidas. */
export const SECOES_DO_TIPO: Record<Exclude<TipoRelatorio, "completo">, SecaoRelatorio[]> = {
  votantes: ["votantes"],
  resultado: ["informacoes", "comparecimento", "resultado"],
}
