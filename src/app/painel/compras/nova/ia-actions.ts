"use server"

import { extractText, getDocumentProxy } from "unpdf"

import { requirePermissao } from "@/lib/auth"
import { FORMAS_PAGAMENTO_COMPRAS } from "@/lib/compras-constantes"
import { validarCnpj, validarCpf } from "@/lib/cpf"
import { TIPOS_COMPROVANTE_COMPRAS } from "@/lib/db/compras"
import {
  buscarFornecedorExistente,
  criarFornecedor,
  salvarEndereco,
  type FornecedorEncontrado,
} from "@/lib/db/fornecedores"
import { gerarJsonIA, gerarJsonIADeImagem, gerarJsonIADePdf } from "@/lib/ia"

// Toda compra é auditada: o texto precisa se sustentar sozinho diante de um
// auditor ou do conselho fiscal, sem depender de quem a registrou.
const REGRAS_AUDITORIA = `Toda compra do sindicato é AUDITADA (conselho fiscal, auditoria contábil, prestação de contas à categoria). O texto deve se sustentar sozinho, sem depender de quem o registrou:
- Português do Brasil, tom formal, impessoal e objetivo; frases curtas.
- Diga O QUÊ, QUANTO (quantidade e unidade) e, quando houver no material, PARA QUÊ — a finalidade institucional da despesa.
- NÃO invente dados: marca, modelo, valor, fornecedor, quantidade, data ou finalidade que não estejam no material fornecido não entram.
- Nada de gírias, abreviações informais, adjetivos promocionais ou opiniões.
- Sem preâmbulo, saudação, título, aspas ou comentários.`

const SISTEMA_REDACAO = `Você é assistente de um sindicato e revisa a redação de um registro de compra.
${REGRAS_AUDITORIA}

Devolva um JSON com duas chaves:
- "produto": a descrição CLARA e PADRONIZADA do produto ou serviço (especificações, quantidade, unidade, características relevantes). Se houver bastante informação, use tópicos iniciados por "- ".
- "observacao": as observações reescritas — contexto, justificativa, referências e detalhes que não cabem na descrição. Se o usuário não escreveu observação, devolva "" (string vazia): NÃO crie uma observação do nada.`

export type RedacaoCompra = {
  produto?: string
  observacao?: string
  erro?: string
}

/** "Melhorar com IA": reescreve a descrição E a observação da compra. */
export async function gerarRedacaoCompra(input: {
  produto: string
  observacao?: string
  tipo?: string
  direta?: boolean
}): Promise<RedacaoCompra> {
  await requirePermissao("aquisicoes_compras_edicao", ["aquisicoes_compra_direta"])

  const rascunho = (input.produto ?? "").trim()
  if (rascunho.length < 3) {
    return {
      erro: "Escreva um rascunho do produto ou serviço antes de usar a IA.",
    }
  }

  const tipoRotulo =
    input.tipo === "servico"
      ? "prestação de serviço"
      : input.tipo === "bem"
        ? "bem / produto"
        : null

  const partes = [
    input.direta
      ? "Modalidade: aquisição direta (a compra já foi feita)."
      : "Modalidade: solicitação ao setor de Compras (ainda será cotada).",
    `Rascunho do produto ou serviço: ${rascunho}`,
  ]
  if (tipoRotulo) partes.push(`Tipo: ${tipoRotulo}`)
  const obs = (input.observacao ?? "").trim()
  partes.push(
    obs ? `Rascunho das observações: ${obs}` : "Observações: (em branco)"
  )

  const { dados, erro } = await gerarJsonIA({
    system: SISTEMA_REDACAO,
    prompt: partes.join("\n"),
  })
  if (erro || !dados) return { erro: erro ?? "A IA não retornou texto." }
  const produto = typeof dados.produto === "string" ? dados.produto.trim() : ""
  const observacao =
    typeof dados.observacao === "string" ? dados.observacao.trim() : ""
  if (!produto) return { erro: "A IA não retornou a descrição." }
  // Observação em branco continua em branco (a IA não deve inventá-la).
  return { produto, observacao: obs ? observacao : "" }
}

// ── Preenchimento semiautomático pela nota ──────────────────────────────────

const SISTEMA_NOTA = `Você lê documentos fiscais brasileiros de uma compra já realizada por um sindicato: NF-e (DANFE), NFS-e, NFC-e / cupom fiscal, recibo ou documento equivalente — muitas vezes digitalizado ou fotografado.
Extraia os dados e redija os textos do registro de compra.
${REGRAS_AUDITORIA}

Devolva um JSON com estas chaves (use null quando o dado não aparecer ou estiver ilegível — NUNCA chute):
- "tipo_documento": "NF-e", "NFS-e", "NFC-e", "Cupom fiscal", "Recibo" ou outro nome curto.
- "numero": número do documento; "serie": série; "chave_acesso": 44 dígitos, só números.
- "data_emissao": data de emissão/da compra no formato AAAA-MM-DD.
- "fornecedor": objeto com "razao_social", "nome_fantasia", "cnpj_cpf" (só dígitos, do EMITENTE/prestador — nunca do destinatário/tomador), "pessoa_juridica" (true/false) e "endereco" (objeto com "logradouro", "numero", "complemento", "bairro", "cidade", "uf" em 2 letras, "cep" só dígitos; ou null).
- "itens": lista de objetos com "descricao", "quantidade" (número), "unidade", "valor_total" (número).
- "valor_total": valor total PAGO do documento (número, ponto como separador decimal), já com descontos e acréscimos.
- "forma_pagamento": exatamente um destes: ${FORMAS_PAGAMENTO_COMPRAS.map((f) => `"${f}"`).join(", ")} — ou null se o documento não disser. Cartão de crédito ou débito = "Cartão"; duplicata/boleto = "Boleto"; transferência/TED/DOC = "Depósito bancário (TED)".
- "vencimento": data de vencimento da fatura/duplicata/boleto (AAAA-MM-DD), se houver; senão null.
- "natureza": "bem" para mercadorias/produtos, "servico" para prestação de serviço.
- "produto": a descrição do que foi adquirido, redigida para o registro de compra a partir dos itens do documento (quantidade, unidade e especificação). Escreva por extenso as abreviações de unidade e de produto (RS → resmas, CX → caixas, UN → unidades, ESF → esferográfica). Vários itens: tópicos iniciados por "- ".
- "observacao": texto para auditoria que identifique o documento fiscal (tipo, número, série, data de emissão, chave de acesso se houver), o emitente com CNPJ/CPF com máscara (00.000.000/0000-00 ou 000.000.000-00), o valor total (e o desconto, se houver) e a forma de pagamento como consta no documento (ex.: "cartão de débito"), se constarem. Não repita a lista de itens.
- "avisos": lista de strings com o que ficou ilegível, ambíguo ou incoerente (ex.: soma dos itens diferente do total). Lista vazia se nada.`

export type FornecedorDaNota = {
  razao_social: string
  nome_fantasia: string
  cnpj_cpf: string
  pessoa_juridica: boolean
  endereco: {
    logradouro: string
    numero: string
    complemento: string
    bairro: string
    cidade: string
    uf: string
    cep: string
  } | null
}

export type LeituraNota = {
  erro?: string
  produto?: string
  observacao?: string
  e_produto?: "bem" | "servico" | ""
  /** No formato do campo do formulário: "1234,56". */
  valor?: string
  data_compra?: string
  vencimento?: string
  forma_pagamento?: string
  /** Ex.: "NF-e nº 1234, série 1". */
  documento?: string
  fornecedorExistente?: FornecedorEncontrado | null
  fornecedorLido?: FornecedorDaNota | null
  avisos?: string[]
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const s = str(v)
  if (!s) return null
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s)
  return Number.isFinite(n) ? n : null
}

/** AAAA-MM-DD (ou DD/MM/AAAA, se a IA escapar do formato) → ISO válido. */
function dataIso(v: unknown): string {
  const s = str(v)
  let iso = ""
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) iso = `${br[3]}-${br[2]}-${br[1]}`
  else if (/^\d{4}-\d{2}-\d{2}/.test(s)) iso = s.slice(0, 10)
  if (!iso) return ""
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? "" : iso
}

/** Lê a nota/cupom com a IA e devolve os campos para pré-preencher a compra. */
export async function lerNotaCompra(formData: FormData): Promise<LeituraNota> {
  await requirePermissao("aquisicoes_compra_direta")

  const arquivo = formData.get("nota_fiscal")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione o arquivo da nota ou do cupom." }
  }
  if (!TIPOS_COMPROVANTE_COMPRAS[arquivo.type]) {
    return { erro: "Envie um PDF ou uma imagem (JPG, PNG ou WEBP)." }
  }
  if (arquivo.size > 4 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 4 MB." }
  }

  const buffer = new Uint8Array(await arquivo.arrayBuffer())
  const base64 = Buffer.from(buffer).toString("base64")
  const prompt =
    "Leia o documento fiscal desta compra e devolva o JSON pedido."

  let resultado
  if (arquivo.type === "application/pdf") {
    // PDF digital (DANFE gerado por sistema): o texto sai direto e é barato.
    // Digitalizado: a IA lê a imagem do próprio PDF.
    let texto = ""
    try {
      const pdf = await getDocumentProxy(buffer)
      texto = (await extractText(pdf, { mergePages: true })).text.trim()
    } catch {
      // PDF só-imagem que o extrator não abre — segue para a visão.
    }
    resultado =
      texto.length >= 80
        ? await gerarJsonIA({
            system: SISTEMA_NOTA,
            prompt: `Texto do documento fiscal:\n\n${texto.slice(0, 60000)}`,
          })
        : await gerarJsonIADePdf({ system: SISTEMA_NOTA, prompt, pdfBase64: base64 })
  } else {
    resultado = await gerarJsonIADeImagem({
      system: SISTEMA_NOTA,
      prompt,
      imagemBase64: base64,
      mimeType: arquivo.type,
    })
  }
  const { dados, erro } = resultado
  if (erro || !dados) return { erro: erro ?? "A IA não conseguiu ler o documento." }

  const avisos = Array.isArray(dados.avisos)
    ? dados.avisos.map(str).filter(Boolean)
    : []

  // Fornecedor: o que a nota diz + se já existe no cadastro.
  const f = (dados.fornecedor ?? {}) as Record<string, unknown>
  const doc = str(f.cnpj_cpf).replace(/\D/g, "")
  const docValido =
    doc.length === 14 ? validarCnpj(doc) : doc.length === 11 ? validarCpf(doc) : false
  if (doc && !docValido) {
    avisos.push(
      `O CNPJ/CPF lido (${doc}) não confere nos dígitos verificadores — pode ter sido lido errado.`
    )
  }
  const end = f.endereco && typeof f.endereco === "object"
    ? (f.endereco as Record<string, unknown>)
    : null
  const fornecedorLido: FornecedorDaNota | null =
    str(f.razao_social) || str(f.nome_fantasia) || doc
      ? {
          razao_social: str(f.razao_social),
          nome_fantasia: str(f.nome_fantasia),
          cnpj_cpf: doc,
          pessoa_juridica: doc ? doc.length === 14 : f.pessoa_juridica !== false,
          endereco:
            end && (str(end.logradouro) || str(end.cidade))
              ? {
                  logradouro: str(end.logradouro),
                  numero: str(end.numero),
                  complemento: str(end.complemento),
                  bairro: str(end.bairro),
                  cidade: str(end.cidade),
                  uf: str(end.uf).toUpperCase().slice(0, 2),
                  cep: str(end.cep).replace(/\D/g, ""),
                }
              : null,
        }
      : null
  const fornecedorExistente = fornecedorLido
    ? await buscarFornecedorExistente({
        cnpjCpf: docValido ? doc : null,
        nomes: [fornecedorLido.razao_social, fornecedorLido.nome_fantasia],
      })
    : null
  if (!fornecedorLido) avisos.push("O emitente do documento não foi identificado.")

  const valorNum = num(dados.valor_total)
  const formaBruta = str(dados.forma_pagamento)
  const forma = (FORMAS_PAGAMENTO_COMPRAS as readonly string[]).includes(formaBruta)
    ? formaBruta
    : ""
  const natureza = str(dados.natureza)

  const tipoDoc = str(dados.tipo_documento)
  const numero = str(dados.numero)
  const serie = str(dados.serie)
  const documento = [
    tipoDoc || "Documento",
    numero ? `nº ${numero}` : "",
    serie ? `série ${serie}` : "",
  ]
    .filter(Boolean)
    .join(" ")

  const dataCompra = dataIso(dados.data_emissao)
  if (!dataCompra) avisos.push("A data da compra não foi encontrada — preencha à mão.")
  if (valorNum === null || valorNum <= 0) {
    avisos.push("O valor total não foi encontrado — preencha à mão.")
  }
  if (!forma) avisos.push("A forma de pagamento não consta no documento — escolha à mão.")

  return {
    produto: str(dados.produto),
    observacao: str(dados.observacao),
    e_produto: natureza === "bem" || natureza === "servico" ? natureza : "",
    valor:
      valorNum !== null && valorNum > 0 ? valorNum.toFixed(2).replace(".", ",") : "",
    data_compra: dataCompra,
    vencimento: dataIso(dados.vencimento),
    forma_pagamento: forma,
    documento,
    fornecedorExistente,
    fornecedorLido,
    avisos,
  }
}

/**
 * Cadastra o fornecedor lido da nota, depois que o usuário confere e confirma
 * os dados. Se o CNPJ já existir (cadastrado entre a leitura e a confirmação),
 * devolve o existente em vez de duplicar.
 */
export async function cadastrarFornecedorDaNota(
  dados: FornecedorDaNota
): Promise<{
  fornecedor?: { id: string; nome: string; cnpj_cpf: string | null; bloqueado: boolean }
  erro?: string
}> {
  await requirePermissao("aquisicoes_compras_edicao", ["aquisicoes_compra_direta"])

  const cnpjCpf = dados.cnpj_cpf.replace(/\D/g, "") || null
  if (cnpjCpf && !(cnpjCpf.length === 14 ? validarCnpj(cnpjCpf) : validarCpf(cnpjCpf))) {
    return { erro: "CNPJ/CPF inválido — confira os dígitos com a nota." }
  }
  const razao = dados.razao_social.trim() || null
  const fantasia = dados.nome_fantasia.trim() || null

  const existente = await buscarFornecedorExistente({
    cnpjCpf,
    nomes: cnpjCpf ? [] : [razao ?? "", fantasia ?? ""],
  })
  if (existente) {
    const { id, nome, cnpj_cpf, bloqueado } = existente
    return { fornecedor: { id, nome, cnpj_cpf, bloqueado } }
  }

  const { id, erro } = await criarFornecedor({
    nome_fantasia: fantasia,
    nome_razao: razao,
    cnpj_cpf: cnpjCpf,
    pessoa_juridica: cnpjCpf ? cnpjCpf.length === 14 : dados.pessoa_juridica,
    fornecedor_bloqueado: false,
  })
  if (erro || !id) return { erro: erro ?? "Não foi possível cadastrar o fornecedor." }

  // Endereço é complemento: se falhar, o fornecedor já está cadastrado.
  const e = dados.endereco
  if (e && (e.logradouro.trim() || e.cidade.trim())) {
    await salvarEndereco(id, {
      nome_endereco: "Endereço da nota fiscal",
      cep: e.cep.replace(/\D/g, "") || null,
      logradouro: e.logradouro.trim() || null,
      numero: e.numero.trim() || null,
      complemento: e.complemento.trim() || null,
      bairro: e.bairro.trim() || null,
      cidade: e.cidade.trim() || null,
      estado: e.uf.trim().toUpperCase().slice(0, 2) || null,
    }).catch(() => undefined)
  }

  return {
    fornecedor: {
      id,
      nome: fantasia ?? razao ?? "(sem nome)",
      cnpj_cpf: cnpjCpf,
      bloqueado: false,
    },
  }
}
