/**
 * Os marcadores do termo de cessão e a renderização — funções puras, fora de
 * `server-only`, para a tela de edição mostrar a prévia sem ir ao servidor.
 *
 * O modelo é institucional e versionado; o que varia de uma cessão para outra
 * são os DADOS. Por isso nada aqui gera texto: só substitui.
 */

export type MarcadorTermo = {
  chave: string
  rotulo: string
  exemplo: string
}

export const MARCADORES: MarcadorTermo[] = [
  { chave: "entidade", rotulo: "Nome da entidade (cedente)", exemplo: "Sindicato dos Trabalhadores" },
  { chave: "concessionario", rotulo: "Quem recebe o espaço", exemplo: "Joana da Silva (Associação X)" },
  { chave: "espaco", rotulo: "Nome do espaço", exemplo: "Auditório — plateia" },
  { chave: "sede", rotulo: "Sede onde fica o espaço", exemplo: "Campos dos Goytacazes" },
  { chave: "finalidade", rotulo: "Para que será usado", exemplo: "Assembleia da categoria" },
  { chave: "publico", rotulo: "Público estimado", exemplo: "120" },
  { chave: "inicio", rotulo: "Início da cessão", exemplo: "04/10/2026, 09:00" },
  { chave: "termino", rotulo: "Término da cessão", exemplo: "04/10/2026, 17:00" },
  { chave: "montagem", rotulo: "Liberação para montagem", exemplo: "Montagem liberada a partir de 04/10/2026, 07:00." },
  { chave: "desmontagem", rotulo: "Prazo de desmontagem", exemplo: "Desmontagem até 04/10/2026, 19:00." },
  { chave: "representante", rotulo: "Responsável do concessionário", exemplo: "Pedro Souza — (22) 99999-0000" },
  { chave: "responsavel_visita", rotulo: "Responsável pela visita técnica", exemplo: "Ana Beatriz Nogueira" },
  { chave: "exigencias", rotulo: "Bombeiros, seguranças e demais exigências", exemplo: "2 bombeiros civis e 3 seguranças." },
  { chave: "custeio", rotulo: "Valor e itens do custeio", exemplo: "Limpeza: R$ 450,00. Total: R$ 450,00." },
  { chave: "local_data", rotulo: "Local e data da assinatura", exemplo: "Campos dos Goytacazes, 24 de setembro de 2026." },
]

export type DadosTermo = Record<string, string>

/**
 * Troca os marcadores pelos dados. Marcador sem valor vira string vazia — e a
 * linha que ficaria sozinha some, para o termo não ter buracos como
 * "Montagem: ." quando não há montagem.
 */
export function renderizarTermo(modelo: string, dados: DadosTermo): string {
  const trocado = modelo.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, chave: string) =>
    (dados[chave] ?? "").trim()
  )
  return trocado
    .split("\n")
    .filter((linha, i, todas) => {
      // Tira linha vazia que sobrou de marcador sem valor, preservando os
      // parágrafos de verdade (uma vazia entre dois blocos com texto).
      if (linha.trim() !== "") return true
      const anterior = todas[i - 1]?.trim() ?? ""
      const proxima = todas[i + 1]?.trim() ?? ""
      return anterior !== "" && proxima !== ""
    })
    .join("\n")
    .trim()
}

/** Marcadores usados no modelo que não existem — avisa quem está escrevendo. */
export function marcadoresDesconhecidos(modelo: string): string[] {
  const conhecidos = new Set(MARCADORES.map((m) => m.chave))
  const usados = [...modelo.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(usados.filter((u) => !conhecidos.has(u)))]
}

/** Código de versão AAAAMMDDHHmm em São Paulo (igual aos termos de filiação). */
export function codigoVersao(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date())
    .replace(/\D/g, "")
}
