/**
 * Saúde — os 50 campos do formulário oficial da CAT, em um lugar só.
 *
 * Serve a dois consumidores, de propósito: a importação em massa usa isto
 * para casar cabeçalhos de planilha e converter valores, e o formulário
 * individual usa para renderizar os campos na ordem do formulário. Manter
 * as duas coisas na mesma tabela evita que um caminho aceite algo que o
 * outro não aceita.
 */

import { normalizarCabecalho } from "@/lib/csv"
import * as n from "@/lib/saude-normalizacao"

export type TipoCampo =
  | "texto"      // grava como veio (só trim)
  | "titulo"     // Título em português
  | "sentenca"   // Primeira letra maiúscula
  | "data"
  | "bool"
  | "inteiro"
  | "cpf"
  | "cid"        // normaliza o CID-10
  | "codigo"     // "<9 dígitos> – descrição" → duas colunas
  | "cbo"        // "<6 dígitos> - descrição" → duas colunas

export type Bloco =
  | "I — Emitente"
  | "II — Empregador"
  | "III — Acidentado"
  | "IV — Acidente ou doença"
  | "V — Atendimento médico"
  | "VI — Atestado médico"

export type CampoCat = {
  /** Número do campo no formulário oficial. É a chave mais confiável para
   *  casar cabeçalhos: planilhas variam o texto, mas mantêm a numeração. */
  n: number
  bloco: Bloco
  /** Coluna no banco. Nos tipos codigo/cbo, a coluna da DESCRIÇÃO. */
  coluna: string
  /** Coluna do código, nos tipos codigo/cbo. */
  colunaCodigo?: string
  rotulo: string
  tipo: TipoCampo
  /**
   * Nomes alternativos de cabeçalho, além do rótulo e da coluna.
   *
   * NÃO usar palavra genérica que sirva a mais de um campo do formulário.
   * "data" descreve os campos 13, 19, 24, 37, 39 e 40; "tipo" descreve o 2,
   * o 8 e o 22; "observações", o 38 e o 50. Um apelido desses faz a coluna
   * cair no campo errado em silêncio — testado: um cabeçalho "data" ia
   * parar no campo 40 (data do atendimento) em vez do 19 (data do
   * acidente). Sem apelido, o casamento falha e o usuário é avisado, que é
   * o desfecho seguro.
   */
  aliases?: string[]
  /** Ocupa a linha inteira no formulário. */
  largo?: boolean
}

export const CAMPOS_CAT: CampoCat[] = [
  // I — Emitente
  { n: 1, bloco: "I — Emitente", coluna: "emitente", rotulo: "Emitente", tipo: "texto" },
  { n: 2, bloco: "I — Emitente", coluna: "tipo_cat", rotulo: "Tipo de CAT", tipo: "texto" },
  { n: 3, bloco: "I — Emitente", coluna: "iniciativa_cat", rotulo: "Iniciativa da CAT", tipo: "texto" },
  { n: 4, bloco: "I — Emitente", coluna: "fonte_cadastramento", rotulo: "Fonte do cadastramento", tipo: "texto" },
  { n: 5, bloco: "I — Emitente", coluna: "numero_cat", rotulo: "Número da CAT", tipo: "texto", aliases: ["numero da cat", "n da cat"] },
  { n: 6, bloco: "I — Emitente", coluna: "recibo_esocial", rotulo: "Recibo do eSocial", tipo: "texto", aliases: ["numero do recibo do evento no esocial da cat de origem"] },

  // II — Empregador
  { n: 7, bloco: "II — Empregador", coluna: "empregador_razao_social", rotulo: "Razão social / Nome", tipo: "titulo", aliases: ["razao social nome", "empregador"] },
  { n: 8, bloco: "II — Empregador", coluna: "empregador_tipo", rotulo: "Tipo do empregador", tipo: "texto" },
  { n: 9, bloco: "II — Empregador", coluna: "empregador_inscricao", rotulo: "Número de inscrição", tipo: "texto", aliases: ["numero de inscricao"] },
  { n: 10, bloco: "II — Empregador", coluna: "empregador_cnae", rotulo: "CNAE", tipo: "texto" },

  // III — Acidentado
  { n: 11, bloco: "III — Acidentado", coluna: "trabalhador_nome", rotulo: "Nome do acidentado", tipo: "titulo", aliases: ["acidentado", "trabalhador"] },
  { n: 12, bloco: "III — Acidentado", coluna: "trabalhador_cpf", rotulo: "CPF", tipo: "cpf" },
  { n: 13, bloco: "III — Acidentado", coluna: "trabalhador_nascimento", rotulo: "Data de nascimento", tipo: "data", aliases: ["nascimento"] },
  { n: 14, bloco: "III — Acidentado", coluna: "trabalhador_sexo", rotulo: "Sexo", tipo: "titulo" },
  { n: 15, bloco: "III — Acidentado", coluna: "trabalhador_estado_civil", rotulo: "Estado civil", tipo: "titulo" },
  { n: 16, bloco: "III — Acidentado", coluna: "trabalhador_cbo", colunaCodigo: "trabalhador_cbo_codigo", rotulo: "CBO", tipo: "cbo" },
  { n: 17, bloco: "III — Acidentado", coluna: "filiacao_previdencia", rotulo: "Filiação à Previdência Social", tipo: "texto", aliases: ["filiacao a ps", "filiacao previdencia"] },
  { n: 18, bloco: "III — Acidentado", coluna: "areas", rotulo: "Áreas", tipo: "texto" },

  // IV — Acidente ou doença
  { n: 19, bloco: "IV — Acidente ou doença", coluna: "data_acidente", rotulo: "Data do acidente", tipo: "data" },
  { n: 20, bloco: "IV — Acidente ou doença", coluna: "hora_acidente", rotulo: "Hora do acidente", tipo: "texto" },
  { n: 21, bloco: "IV — Acidente ou doença", coluna: "horas_trabalhadas_antes", rotulo: "Após quantas horas de trabalho", tipo: "texto" },
  { n: 22, bloco: "IV — Acidente ou doença", coluna: "tipo_acidente", rotulo: "Tipo do acidente", tipo: "texto" },
  { n: 23, bloco: "IV — Acidente ou doença", coluna: "houve_afastamento", rotulo: "Houve afastamento?", tipo: "bool" },
  { n: 24, bloco: "IV — Acidente ou doença", coluna: "ultimo_dia_trabalhado", rotulo: "Último dia trabalhado", tipo: "data" },
  { n: 25, bloco: "IV — Acidente ou doença", coluna: "local_acidente", rotulo: "Local do acidente", tipo: "texto" },
  { n: 26, bloco: "IV — Acidente ou doença", coluna: "local_especificacao", rotulo: "Especificação do local", tipo: "texto", largo: true, aliases: ["especificacao do local do acidente"] },
  { n: 27, bloco: "IV — Acidente ou doença", coluna: "local_inscricao", rotulo: "CNPJ/CAEPF/CNO do local", tipo: "texto" },
  { n: 28, bloco: "IV — Acidente ou doença", coluna: "local_uf", rotulo: "UF", tipo: "texto" },
  { n: 29, bloco: "IV — Acidente ou doença", coluna: "local_municipio", rotulo: "Município do local", tipo: "texto", aliases: ["municipio", "municipio do local do acidente"] },
  { n: 30, bloco: "IV — Acidente ou doença", coluna: "local_pais", rotulo: "País", tipo: "texto" },
  { n: 31, bloco: "IV — Acidente ou doença", coluna: "parte_atingida", colunaCodigo: "parte_atingida_codigo", rotulo: "Parte do corpo atingida", tipo: "codigo", largo: true },
  { n: 32, bloco: "IV — Acidente ou doença", coluna: "agente_causador", colunaCodigo: "agente_causador_codigo", rotulo: "Agente causador", tipo: "codigo", largo: true },
  { n: 33, bloco: "IV — Acidente ou doença", coluna: "lateralidade", rotulo: "Lateralidade", tipo: "texto" },
  { n: 34, bloco: "IV — Acidente ou doença", coluna: "situacao_geradora", colunaCodigo: "situacao_geradora_codigo", rotulo: "Situação geradora do acidente ou doença", tipo: "codigo", largo: true, aliases: ["descricao da situacao geradora do acidente ou doenca", "situacao geradora"] },
  { n: 35, bloco: "IV — Acidente ou doença", coluna: "houve_registro_policial", rotulo: "Houve registro policial?", tipo: "bool" },
  { n: 36, bloco: "IV — Acidente ou doença", coluna: "houve_morte", rotulo: "Houve morte?", tipo: "bool" },
  { n: 37, bloco: "IV — Acidente ou doença", coluna: "data_obito", rotulo: "Data do óbito", tipo: "data" },
  { n: 38, bloco: "IV — Acidente ou doença", coluna: "observacoes_acidente", rotulo: "Observações do acidente", tipo: "sentenca", largo: true },
  { n: 39, bloco: "IV — Acidente ou doença", coluna: "data_recebimento", rotulo: "Data do recebimento", tipo: "data" },

  // V — Atendimento médico
  { n: 40, bloco: "V — Atendimento médico", coluna: "data_atendimento", rotulo: "Data do atendimento", tipo: "data" },
  { n: 41, bloco: "V — Atendimento médico", coluna: "hora_atendimento", rotulo: "Hora do atendimento", tipo: "texto" },
  { n: 42, bloco: "V — Atendimento médico", coluna: "houve_internacao", rotulo: "Houve internação?", tipo: "bool" },
  { n: 43, bloco: "V — Atendimento médico", coluna: "duracao_tratamento_dias", rotulo: "Provável duração do tratamento (dias)", tipo: "inteiro" },
  { n: 44, bloco: "V — Atendimento médico", coluna: "afastamento_durante_tratamento", rotulo: "Deverá afastar-se durante o tratamento?", tipo: "bool", aliases: ["devera o acidentado afastar se do trabalho durante o tratamento"] },

  // VI — Atestado médico
  { n: 45, bloco: "VI — Atestado médico", coluna: "natureza_lesao", colunaCodigo: "natureza_lesao_codigo", rotulo: "Descrição e natureza da lesão", tipo: "codigo", largo: true },
  { n: 46, bloco: "VI — Atestado médico", coluna: "diagnostico_provavel", rotulo: "Diagnóstico provável", tipo: "sentenca", largo: true },
  { n: 47, bloco: "VI — Atestado médico", coluna: "cid10", rotulo: "CID-10", tipo: "cid", aliases: ["cid"] },
  { n: 48, bloco: "VI — Atestado médico", coluna: "local_e_data", rotulo: "Local e data", tipo: "texto" },
  { n: 49, bloco: "VI — Atestado médico", coluna: "medico_nome_crm_uf", rotulo: "Nome do médico, CRM e UF", tipo: "titulo", largo: true, aliases: ["nome do medico crm e uf", "medico"] },
  { n: 50, bloco: "VI — Atestado médico", coluna: "observacoes_atestado", rotulo: "Observações do atestado", tipo: "sentenca", largo: true },
]

export const BLOCOS: Bloco[] = [
  "I — Emitente",
  "II — Empregador",
  "III — Acidentado",
  "IV — Acidente ou doença",
  "V — Atendimento médico",
  "VI — Atestado médico",
]

/** Campos usados como entrada de formulário: `n<numero>` no FormData. */
export function nomeCampo(campo: CampoCat): string {
  return `campo_${campo.n}`
}

/**
 * Casa um cabeçalho de planilha com um campo.
 *
 * A numeração do formulário vem primeiro porque é o que sobrevive às
 * variações de texto: o export do Bubble usa "31 - ACIDENTE Parte do corpo
 * atingida", uma planilha da equipe pode usar "31 - Parte atingida", e as
 * duas apontam para o mesmo campo. Sem número, cai no casamento por nome.
 */
export function acharCampo(cabecalho: string): CampoCat | null {
  const bruto = cabecalho.trim()
  if (!bruto) return null

  const numero = /^(\d{1,2})\s*[-–—.)]/.exec(bruto)
  if (numero) {
    const achado = CAMPOS_CAT.find((c) => c.n === Number(numero[1]))
    if (achado) return achado
  }

  const alvo = normalizarCabecalho(bruto)
  if (!alvo) return null
  return (
    CAMPOS_CAT.find((c) => {
      const nomes = [c.coluna, c.rotulo, ...(c.aliases ?? [])]
      if (c.colunaCodigo) nomes.push(c.colunaCodigo)
      return nomes.some((x) => normalizarCabecalho(x) === alvo)
    }) ?? null
  )
}

/** Aplica a normalização do campo e devolve as colunas que ele preenche. */
export function valorParaColunas(
  campo: CampoCat,
  bruto: string
): Record<string, string | number | boolean | null> {
  switch (campo.tipo) {
    case "titulo":
      return { [campo.coluna]: n.titulo(bruto) }
    case "sentenca":
      return { [campo.coluna]: n.sentenca(bruto) }
    case "data":
      return { [campo.coluna]: n.data(bruto) }
    case "bool":
      return { [campo.coluna]: n.booleano(bruto) }
    case "inteiro":
      return { [campo.coluna]: n.inteiro(bruto) }
    case "cpf":
      return { [campo.coluna]: n.cpf(bruto) }
    case "cid":
      return { [campo.coluna]: n.cid(bruto) }
    case "codigo": {
      const { codigo, descricao } = n.separarCodigo(bruto)
      return { [campo.coluna]: descricao, [campo.colunaCodigo!]: codigo }
    }
    case "cbo": {
      const { codigo, descricao } = n.separarCbo(bruto)
      return { [campo.coluna]: descricao, [campo.colunaCodigo!]: codigo }
    }
    default:
      return { [campo.coluna]: n.nz(bruto) }
  }
}

/** Campos 31/32/34/45: sem código, o registro entra na fila de revisão. */
export const CAMPOS_COM_CODIGO_OFICIAL = [31, 32, 34, 45]
