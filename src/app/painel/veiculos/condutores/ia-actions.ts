"use server"

import { extractText, getDocumentProxy } from "unpdf"

import { requirePermissao } from "@/lib/auth"
import { formatarData } from "@/lib/formato"
import {
  gerarJsonIA,
  gerarJsonIADeImagem,
  gerarJsonIADePdf,
  type EsquemaJsonIA,
} from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { CATEGORIAS_CNH } from "@/lib/veiculos-constantes"

/**
 * Leitura da CNH pela IA no cadastro do condutor: ao escolher o arquivo, nº de
 * registro, categoria e validade vêm preenchidos para conferir — e, no
 * cadastro novo, o usuário dono do CPF da carteira já vem escolhido. Mesmo
 * caminho da fatura da locadora: PDF com texto (CNH digital) vai como texto;
 * digitalizado ou foto, pela visão. Nada é gravado aqui.
 */

const SISTEMA_CNH = `Você lê a CARTEIRA NACIONAL DE HABILITAÇÃO (CNH) brasileira — física (foto ou digitalização, frente e/ou verso) ou a CNH Digital em PDF.

Devolva um JSON com estas chaves (use null quando o dado não aparecer ou estiver ilegível — NUNCA chute):
- "nome": nome do condutor como impresso.
- "cpf": CPF do condutor, só os 11 dígitos.
- "registro": Nº DE REGISTRO da CNH (11 dígitos, campo "Nº REGISTRO"), só os dígitos. NÃO é o número do espelho/formulário, nem o RENACH, nem o RG.
- "categoria": CATEGORIA de habilitação ("CAT. HAB."), em maiúsculas sem espaços: A, B, AB, C, D, E, AC, AD ou AE. ACC conta como "A".
- "validade": data de VALIDADE da carteira, AAAA-MM-DD.
- "primeira_habilitacao": data da 1ª habilitação, AAAA-MM-DD.
- "data_nascimento": data de nascimento, AAAA-MM-DD.
- "observacoes": o campo OBSERVAÇÕES da carteira, como impresso (ex.: "EAR", "A" = uso de lentes, restrições). null se vazio.
- "avisos": lista de strings com o que ficou ilegível, cortado ou incoerente (ex.: foto só do verso, validade borrada, documento que não é CNH). Lista vazia se nada.`

const ESQUEMA_CNH: EsquemaJsonIA = {
  nome: "cnh",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "nome",
      "cpf",
      "registro",
      "categoria",
      "validade",
      "primeira_habilitacao",
      "data_nascimento",
      "observacoes",
      "avisos",
    ],
    properties: {
      nome: { type: ["string", "null"] },
      cpf: { type: ["string", "null"] },
      registro: { type: ["string", "null"] },
      categoria: { type: ["string", "null"] },
      validade: { type: ["string", "null"] },
      primeira_habilitacao: { type: ["string", "null"] },
      data_nascimento: { type: ["string", "null"] },
      observacoes: { type: ["string", "null"] },
      avisos: { type: "array", items: { type: "string" } },
    },
  },
}

export type LeituraCnh = {
  erro?: string
  numero?: string
  categoria?: string
  validade?: string
  /** Observações da carteira (EAR, lentes…), para o campo Observação. */
  observacao?: string
  /** Usuário do tenant com o CPF da carteira (cadastro novo). */
  usuarioId?: string
  /** "Fulano · CPF 123.456.789-00 · 1ª habilitação 01/02/2003". */
  resumo?: string
  avisos?: string[]
}

const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"]

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""
}

function dataIso(v: unknown): string {
  const s = str(v)
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ""
  return iso && !Number.isNaN(new Date(`${iso}T12:00:00`).getTime()) ? iso : ""
}

function cpfFormatado(d: string): string {
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d
}

/** Sem acento, minúsculo, um espaço — para comparar nomes. */
function nomeNormal(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Lê a CNH escolhida e devolve os campos do cadastro do condutor. Com
 * `usuario_id` (edição, ou o usuário já escolhido), avisa se o CPF ou o nome
 * da carteira não são os dele; sem, procura o usuário pelo CPF.
 */
export async function lerCnh(formData: FormData): Promise<LeituraCnh> {
  const sessao = await requirePermissao("veiculos_gestao")
  const arquivo = formData.get("arquivo")
  const usuarioId = str(formData.get("usuario_id"))
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione o arquivo da CNH." }
  if (!TIPOS.includes(arquivo.type)) return { erro: "Envie a CNH em PDF ou imagem (JPG, PNG ou WEBP)." }
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "O arquivo deve ter no máximo 4 MB." }

  const buffer = new Uint8Array(await arquivo.arrayBuffer())
  const base64 = Buffer.from(buffer).toString("base64")
  const ctx = { processo: "veiculos.cnh", usuarioId: String(sessao.usuario.id) }
  const prompt = "Leia esta CNH e devolva o JSON pedido."
  let resultado
  if (arquivo.type === "application/pdf") {
    let texto = ""
    try {
      // getDocumentProxy esvazia o buffer (transfere): o base64 já foi tirado antes.
      const pdf = await getDocumentProxy(buffer)
      texto = (await extractText(pdf, { mergePages: true })).text.trim()
    } catch {
      // PDF só-imagem: segue para a visão.
    }
    resultado =
      texto.length >= 60
        ? await gerarJsonIA({ ...ctx, system: SISTEMA_CNH, prompt: `Texto da CNH:\n\n${texto.slice(0, 20000)}`, esquema: ESQUEMA_CNH })
        : await gerarJsonIADePdf({ ...ctx, system: SISTEMA_CNH, prompt, pdfBase64: base64, esquema: ESQUEMA_CNH })
  } else {
    resultado = await gerarJsonIADeImagem({
      ...ctx,
      system: SISTEMA_CNH,
      prompt,
      imagemBase64: base64,
      mimeType: arquivo.type,
      esquema: ESQUEMA_CNH,
    })
  }
  const { dados, erro } = resultado
  if (erro || !dados) return { erro: erro ?? "A IA não conseguiu ler a CNH." }

  const avisos = Array.isArray(dados.avisos) ? dados.avisos.map(str).filter(Boolean) : []
  const nome = str(dados.nome)
  const cpf = str(dados.cpf).replace(/\D/g, "")
  const numero = str(dados.registro).replace(/\D/g, "")
  const validade = dataIso(dados.validade)
  const primeira = dataIso(dados.primeira_habilitacao)
  const categoriaBruta = str(dados.categoria).toUpperCase().replace(/[^A-Z]/g, "")
  const categoria = categoriaBruta === "ACC" ? "A" : categoriaBruta
  const observacao = str(dados.observacoes)

  if (categoria && !(CATEGORIAS_CNH as readonly string[]).includes(categoria)) {
    avisos.push(`A categoria lida ("${categoria}") não está na lista — escolha à mão.`)
  }
  if (numero && numero.length !== 11) {
    avisos.push(`O nº de registro lido tem ${numero.length} dígitos (a CNH tem 11) — confira na carteira.`)
  }
  const hoje = new Date().toISOString().slice(0, 10)
  if (validade && validade < hoje) avisos.push(`Esta CNH venceu em ${formatarData(validade)}.`)
  if (!validade) avisos.push("Não deu para ler a validade — preencha à mão.")

  // Dono da carteira: pelo CPF entre os usuários do tenant (o CPF pode estar
  // guardado com ou sem pontuação).
  let donoId: string | undefined
  if (cpf.length === 11 || usuarioId) {
    const admin = await createAdminClient()
    const emp = await tenantAtual()
    if (usuarioId) {
      const { data: u } = await admin
        .from("usuarios")
        .select("nome_completo, cpf")
        .eq("emp_proprietaria_id", emp)
        .eq("id", usuarioId)
        .maybeSingle()
      const cpfUsuario = str(u?.cpf).replace(/\D/g, "")
      const nomeUsuario = str(u?.nome_completo)
      if (cpf && cpfUsuario && cpf !== cpfUsuario) {
        avisos.push(`O CPF da carteira (${cpfFormatado(cpf)}) não é o do cadastro de ${nomeUsuario || "quem está escolhido"} — é a CNH certa?`)
      } else if (!cpfUsuario && nome && nomeUsuario && nomeNormal(nome) !== nomeNormal(nomeUsuario)) {
        avisos.push(`O nome da carteira (${nome}) difere do cadastro (${nomeUsuario}) — confira se é a mesma pessoa.`)
      }
    } else {
      const { data: achados } = await admin
        .from("usuarios")
        .select("id")
        .eq("emp_proprietaria_id", emp)
        .in("cpf", [cpf, cpfFormatado(cpf)])
        .not("deletado", "is", true)
        .limit(2)
      if (achados?.length === 1) donoId = String(achados[0].id)
      else if (!achados?.length) avisos.push(`Nenhum usuário com o CPF ${cpfFormatado(cpf)} — escolha o usuário na lista.`)
      else avisos.push(`Há mais de um usuário com o CPF ${cpfFormatado(cpf)} — escolha o usuário na lista.`)
    }
  }

  const resumo = [
    nome || null,
    cpf ? `CPF ${cpfFormatado(cpf)}` : null,
    primeira ? `1ª habilitação ${formatarData(primeira)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return {
    numero: numero || undefined,
    categoria: (CATEGORIAS_CNH as readonly string[]).includes(categoria) ? categoria : undefined,
    validade: validade || undefined,
    observacao: observacao || undefined,
    usuarioId: donoId,
    resumo: resumo || undefined,
    avisos,
  }
}
