import "server-only"
import { extractText, getDocumentProxy } from "unpdf"

import { gerarJsonIA, gerarJsonIADePdf } from "@/lib/ia"
import { CAMPOS_CAT, nomeCampo, type CampoCat, type TipoCampo } from "@/lib/saude-campos"
import * as n from "@/lib/saude-normalizacao"

/**
 * Leitura de CAT em PDF pela IA.
 *
 * Circulam dois modelos de formulário, com numerações DIFERENTES:
 *
 *  - eSocial / CAT Web ("CAT - Comunicado de Acidente do Trabalho", campos
 *    1 a 50): é a numeração de CAMPOS_CAT; o valor já vem escrito por extenso
 *    ("Inicial", "Trajeto", "1 - Masculino").
 *  - INSS antigo ("PREVIDÊNCIA SOCIAL — Comunicação de acidente de trabalho",
 *    campos 1 a 67): as opções são marcadas por um DÍGITO numa caixinha
 *    ("33- Tipo … 1"), que no texto extraído aparece solto, longe do rótulo.
 *
 * Por isso o prompt traz o mapa do modelo antigo e as tabelas de códigos, e a
 * resposta sai em Structured Outputs com a lista fechada de opções de cada
 * campo de lista — no mesmo vocabulário que a base já usa (medido em
 * 16/10/2026 sobre as 13.720 CATs). O que a IA devolver ainda passa por uma
 * normalização final aqui, que não depende do modelo obedecer.
 */

/** Opções de cada campo de lista, como estão gravadas na base. */
const OPCOES: Record<string, string[]> = {
  emitente: ["Empregador", "Sindicato", "Médico assistente", "Segurado ou seus dependentes", "Autoridade pública"],
  tipo_cat: ["Inicial", "Reabertura", "Comunicado de Óbito"],
  iniciativa_cat: ["Empregador", "Sindicato", "Médico assistente", "Segurado ou seus dependentes", "Autoridade pública"],
  fonte_cadastramento: ["eSocial", "CatWeb", "Manual"],
  empregador_tipo: ["CNPJ", "CPF", "CAEPF", "CNO", "CEI", "NIT"],
  trabalhador_sexo: ["Masculino", "Feminino"],
  trabalhador_estado_civil: ["Solteiro", "Casado", "Viúvo", "Divorciado", "Separado", "Outro", "Ignorado"],
  filiacao_previdencia: ["Empregado", "Trabalhador avulso", "Segurado especial", "Médico residente"],
  areas: ["Urbana", "Rural"],
  tipo_acidente: ["Típico", "Doença Ocupacional", "Trajeto"],
  lateralidade: ["Direita", "Esquerda", "Ambas", "Não aplicável"],
}

/** Sinônimos que o formulário usa para uma opção (comparação sem acento/caixa). */
const SINONIMOS: Record<string, Record<string, string>> = {
  emitente: { medico: "Médico assistente", segurado: "Segurado ou seus dependentes", "segurado ou dependente": "Segurado ou seus dependentes", "autoridade": "Autoridade pública" },
  iniciativa_cat: { "iniciativa do empregador": "Empregador", "iniciativa do sindicato": "Sindicato", medico: "Médico assistente", "iniciativa do medico": "Médico assistente", "iniciativa do segurado": "Segurado ou seus dependentes" },
  tipo_cat: { inicio: "Inicial", obito: "Comunicado de Óbito", "comunicado de obito": "Comunicado de Óbito" },
  fonte_cadastramento: { "cat web": "CatWeb", catweb: "CatWeb" },
  empregador_tipo: { "cgc/cnpj": "CNPJ", cgc: "CNPJ" },
  trabalhador_estado_civil: { "solteiro(a)": "Solteiro", "casado(a)": "Casado", "viuvo(a)": "Viúvo", "divorciado(a)": "Divorciado", "separado(a)": "Separado", outros: "Outro" },
  filiacao_previdencia: { "empregado domestico": "Empregado" },
  areas: { urbano: "Urbana", rural: "Rural" },
  tipo_acidente: { tipico: "Típico", doenca: "Doença Ocupacional", "doenca ocupacional": "Doença Ocupacional", "doenca do trabalho": "Doença Ocupacional" },
  lateralidade: { direito: "Direita", esquerdo: "Esquerda", ambos: "Ambas", "nao se aplica": "Não aplicável" },
}

const DICA_TIPO: Partial<Record<TipoCampo, string>> = {
  data: "data no formato AAAA-MM-DD",
  bool: '"Sim" ou "Não"',
  cpf: "CPF (11 dígitos)",
  cbo: 'código CBO de 6 dígitos e a descrição, "214205 - Engenheiro civil"; só o código se não houver descrição',
  codigo: 'código oficial de 9 dígitos e a descrição, "754000000 - Pescoço"; só a descrição se o formulário não trouxer o código',
  cid: "UM código CID-10, o principal (ex.: S50.0)",
  inteiro: "número de dias, só os dígitos",
}

function dica(c: CampoCat): string {
  const opcoes = OPCOES[c.coluna]
  if (opcoes) return `uma de: ${opcoes.map((o) => `"${o}"`).join(", ")}`
  if (c.coluna === "hora_acidente" || c.coluna === "hora_atendimento") return "hora HH:MM"
  if (c.coluna === "horas_trabalhadas_antes") return "duração HH:MM"
  return DICA_TIPO[c.tipo] ?? "texto"
}

const LISTA_CAMPOS = CAMPOS_CAT.map((c) => `- "${c.coluna}" (campo ${c.n} — ${c.rotulo}): ${dica(c)}`).join("\n")

const SISTEMA = `Você extrai os dados de um formulário de CAT (Comunicação de Acidente de Trabalho) e devolve um objeto JSON.
Leia o formulário (texto extraído ou imagem escaneada) e preencha CADA chave abaixo com o valor do documento.

Regras gerais:
- Campo ausente ou em branco: "" (string vazia). NÃO invente nada que não esteja no documento.
- Campos de lista: use exatamente uma das opções indicadas, ou "" se o formulário não marcar nenhuma. Nunca copie o código numérico da opção ("1 - Masculino" → "Masculino").
- Um título de seção (ex.: "Acidente ou Doença", "Acidentado", "Lesão", "Diagnóstico") nunca é valor de campo.
- Datas em AAAA-MM-DD. Horas em HH:MM ("04:12 Hora(s)" → "04:12").
- Duração do tratamento: só o número de dias ("5 dias" → "5", "1 Dia" → "1"; semanas/meses convertidos em dias).
- Número da CAT: o número que identifica ESTA CAT, em qualquer formato ("1.1.0000000043694738903", "2025.156873.3/01"). Quando o formulário traz um único número abaixo de "Número da CAT" e "Recibo evento eSocial", ele é o Número da CAT; o recibo do eSocial só se refere à CAT de ORIGEM numa reabertura ou óbito.
- Vários CIDs: o primeiro vai em "cid10"; todos, com código e descrição, vão no diagnóstico provável, separados por "; ". Remova marcações como "<br>".
- Tipo do empregador e número de inscrição vêm juntos ("CNPJ 68.773.597/0011-12"): separe-os.
- O formulário de CAT não traz o CPF em todos os modelos; o PIS/PASEP/NIT NÃO é CPF.
- CBO: o código só existe quando há 6 dígitos; sem código, escreva só o nome da ocupação ("Prof. Petrobras de Nivel Tecnico Senior"). Um "0" solto depois da ocupação não é código.

Há dois modelos de formulário. Identifique qual é antes de ler.

MODELO eSocial / CAT Web ("CAT - Comunicado de Acidente do Trabalho", campos 1 a 50): a numeração é a mesma das chaves abaixo; os valores já vêm por extenso.

MODELO INSS antigo ("PREVIDÊNCIA SOCIAL", campos 1 a 67): a numeração é OUTRA, e as opções são marcadas por um dígito numa caixinha. No texto extraído esses dígitos aparecem soltos, numa linha própria ou colados ao número do campo seguinte ("1 115- Estado civil" = sexo 1 e estado civil 1; "1 2 1" depois do bloco do acidentado = filiação 1, aposentado 2, área 1). Mapa:
  1 Emitente (1 Empregador, 2 Sindicato, 3 Médico assistente, 4 Segurado ou seus dependentes, 5 Autoridade pública) → emitente; neste modelo não há iniciativa nem fonte do cadastramento: deixe "".
  2 Tipo de CAT (1 Inicial, 2 Reabertura, 3 Comunicado de Óbito) → tipo_cat
  3 Razão social → empregador_razao_social · 4 Tipo (1 CNPJ, 2 CEI, 3 CPF, 4 NIT) e número → empregador_tipo e empregador_inscricao · 5 CNAE → empregador_cnae
  11 Nome → trabalhador_nome (10 Nome social e 12 Nome da mãe são ignorados) · 13 Nascimento · 14 Sexo (1 Masculino, 3 Feminino) · 15 Estado civil (1 Solteiro, 2 Casado, 3 Viúvo, 4 Divorciado, 5 Outro, 6 Ignorado)
  26 Ocupação + 27 CBO → trabalhador_cbo · 28 Filiação (1 Empregado, 2 Trabalhador avulso, 7 Segurado especial, 8 Médico residente) · 29 Áreas (1 Urbana, 2 Rural); o "Aposentado?" é ignorado
  30 Data do acidente · 31 Hora · 32 Após quantas horas · 33 Tipo (1 Típico, 2 Doença Ocupacional, 3 Trajeto) · 34 Houve afastamento (1 Sim, 2 Não) · 35 Último dia trabalhado
  36 Local → local_acidente · 37 Especificação → local_especificacao · 38 CNPJ do local → local_inscricao · 39 UF → local_uf · 40 Município → local_municipio · país: "Brasil" se o local for no Brasil
  41 Parte do corpo → parte_atingida · 42 Agente causador → agente_causador · 43 Descrição da situação geradora → situacao_geradora · 44 Registro policial (1 Sim, 2 Não) · 45 Morte (1 Sim, 2 Não)
  54 Unidade de atendimento e 55 Data → local_e_data ("Ambulatório X - 15/10/2026"); 55 Data → data_atendimento · 56 Hora → hora_atendimento · 57 Internação (1 Sim, 2 Não) · 58 Duração do tratamento · 59 Afastar-se durante o tratamento (1 Sim, 2 Não)
  60 Descrição e natureza da lesão → natureza_lesao · 61 Diagnóstico provável · 62 CID-10 · 63 Observações → observacoes_atestado · nome e CRM do médico que assina → medico_nome_crm_uf
  64 Recebida em → data_recebimento · 66 Número da CAT → numero_cat

Chaves esperadas (use exatamente estes nomes):
${LISTA_CAMPOS}`

/** Structured Outputs: todas as chaves, string, e as listas fechadas (com ""). */
const ESQUEMA = {
  nome: "cat",
  schema: {
    type: "object",
    additionalProperties: false,
    required: CAMPOS_CAT.map((c) => c.coluna),
    properties: Object.fromEntries(
      CAMPOS_CAT.map((c) => {
        const opcoes = OPCOES[c.coluna]
        return [c.coluna, opcoes ? { type: "string", enum: [...opcoes, ""] } : { type: "string" }]
      })
    ),
  },
}

/** Sem acento, minúsculo, espaços colapsados. */
function chave(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

/** Valor de lista → a opção da base; null quando não reconhece. */
function opcao(coluna: string, bruto: string): string | null {
  const opcoes = OPCOES[coluna]
  // "1 - Masculino", "2- Casado(a)": o código da opção não interessa.
  const t = chave(bruto.replace(/^\d+\s*[-–—.)]\s*/, ""))
  const direta = opcoes.find((o) => chave(o) === t)
  if (direta) return direta
  return SINONIMOS[coluna]?.[t] ?? null
}

/** "04:12 Hora(s)", "4h12", "6:30:00" → "04:12"; outra coisa fica como veio. */
function hora(bruto: string): string {
  const m = /^(\d{1,2})\s*[:h]\s*(\d{2})/i.exec(bruto.trim())
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : bruto
}

/** Texto do valor, aceitando número/booleano que o modelo devolva sem esquema. */
function texto(v: unknown): string {
  if (typeof v === "string") return v.replace(/<br\s*\/?>/gi, "; ").replace(/\s+/g, " ").trim()
  if (typeof v === "number") return String(v)
  if (typeof v === "boolean") return v ? "Sim" : "Não"
  return ""
}

export type LeituraCat =
  | { valores: Record<string, string>; avisos: string[]; erro?: undefined }
  | { erro: string; valores?: undefined; avisos?: undefined }

/**
 * Lê uma CAT em PDF com a IA e devolve os valores do formulário
 * (`campo_<n>`), já no formato que cada campo aceita.
 */
export async function lerCatDoPdf(
  buffer: Uint8Array,
  /** Pula o texto e lê pela imagem — para testar o caminho do escaneado. */
  opcoes: { soVisao?: boolean } = {}
): Promise<LeituraCat> {
  // Tenta o texto selecionável (PDF digital) — mais barato e rápido.
  let textoPdf = ""
  if (!opcoes.soVisao) {
    try {
      // Cópia: o pdf.js transfere (esvazia) o buffer que recebe, e o mesmo
      // buffer ainda pode ir para a visão logo abaixo.
      const pdf = await getDocumentProxy(buffer.slice())
      const extraido = await extractText(pdf, { mergePages: true })
      textoPdf = extraido.text.trim()
    } catch {
      // Pode ser um PDF só-imagem que o extrator não abre — segue para a visão.
    }
  }

  // Digital: extrai do texto. Escaneado/imagem: usa a VISÃO nativa do modelo
  // sobre o próprio PDF (mais lento e mais caro, mas lê o formulário na imagem).
  const { dados, erro } =
    textoPdf.length >= 40
      ? await gerarJsonIA({
          system: SISTEMA,
          prompt: `Texto do formulário de CAT:\n\n${textoPdf}`,
          esquema: ESQUEMA,
        })
      : buffer.byteLength > 20 * 1024 * 1024
        ? { dados: undefined, erro: "PDF escaneado grande demais — máximo de 20 MB." }
        : await gerarJsonIADePdf({
            system: SISTEMA,
            prompt: "Leia o formulário de CAT contido neste PDF (que pode ser escaneado/imagem) e extraia os campos.",
            pdfBase64: Buffer.from(buffer).toString("base64"),
            esquema: ESQUEMA,
          })
  if (erro || !dados) return { erro: erro ?? "Falha na extração." }

  const valores: Record<string, string> = {}
  const avisos: string[] = []
  for (const campo of CAMPOS_CAT) {
    const bruto = texto(dados[campo.coluna])
    if (!bruto) continue

    let valor: string | null = bruto
    if (OPCOES[campo.coluna]) {
      valor = opcao(campo.coluna, bruto)
      if (!valor) avisos.push(`Campo ${campo.n} (${campo.rotulo}): "${bruto}" não é uma opção conhecida — confira.`)
    } else if (campo.tipo === "data") {
      valor = n.data(bruto)
      if (!valor) avisos.push(`Campo ${campo.n} (${campo.rotulo}): data não reconhecida ("${bruto}").`)
    } else if (campo.tipo === "bool") {
      const b = n.booleano(bruto)
      valor = b === true ? "Sim" : b === false ? "Não" : null
    } else if (campo.tipo === "inteiro") {
      valor = /\d/.test(bruto) ? String(n.inteiro(bruto)) : null
    } else if (campo.tipo === "cid") {
      // Rede de segurança: se vierem vários, fica o primeiro.
      const [primeiro, ...outros] = bruto.split(/[;,/]|\s+e\s+/).map((s) => s.trim()).filter(Boolean)
      valor = primeiro ? n.cid(primeiro) : null
      if (outros.length) avisos.push(`Campo ${campo.n} (CID-10): vieram ${outros.length + 1} CIDs; ficou o primeiro (${primeiro}) — os outros: ${outros.join(", ")}.`)
    } else if (campo.coluna === "hora_acidente" || campo.coluna === "hora_atendimento" || campo.coluna === "horas_trabalhadas_antes") {
      valor = hora(bruto)
    }
    if (valor) valores[nomeCampo(campo)] = valor
  }

  if (Object.keys(valores).length === 0) {
    return { erro: "A IA não conseguiu extrair campos deste PDF." }
  }
  return { valores, avisos }
}
