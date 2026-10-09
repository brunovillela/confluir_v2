import "server-only"

import { validarCnpj } from "@/lib/cpf"
import { buscarFornecedorExistente } from "@/lib/db/fornecedores"
import { gerarJsonIA } from "@/lib/ia"

/**
 * Cadastro de fornecedor ASSISTIDO pelo CNPJ (05/10/2026). Os dados vêm do
 * cadastro público da Receita Federal (BrasilAPI; minhareceita.org de
 * reserva — mesmo formato). A IA NÃO consulta nada: recebe esse registro e
 * devolve os nomes padronizados, um resumo da atividade e os alertas que
 * importam para a auditoria (situação cadastral, empresa recém-aberta…).
 * Sem IA, a mesma ficha sai com uma padronização simples.
 */

export type EnderecoCnpj = {
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

export type DadosCnpj = {
  cnpj: string
  nome_razao: string | null
  nome_fantasia: string | null
  situacao: string | null
  abertura: string | null
  atividade: string | null
  telefone: string | null
  email: string | null
  endereco: EnderecoCnpj | null
  alertas: string[]
  /** Já existe cadastro ativo com este CNPJ no tenant. */
  existente: { id: string; nome: string } | null
  /** A padronização passou pela IA (false = regra simples, IA indisponível). */
  viaIA: boolean
}

const FONTES = [
  (c: string) => `https://brasilapi.com.br/api/cnpj/v1/${c}`,
  (c: string) => `https://minhareceita.org/${c}`,
]

const s = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null

async function consultarReceita(cnpj: string): Promise<{ dados?: Record<string, unknown>; erro?: string }> {
  let ultimoErro = "Não foi possível consultar o CNPJ agora."
  for (const url of FONTES) {
    try {
      const r = await fetch(url(cnpj), {
        headers: { Accept: "application/json", "User-Agent": "Confluir/1.0" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      })
      if (r.status === 404 || r.status === 400) {
        return { erro: "CNPJ não encontrado no cadastro da Receita Federal." }
      }
      if (!r.ok) {
        ultimoErro = `Consulta do CNPJ indisponível (HTTP ${r.status}).`
        continue
      }
      return { dados: (await r.json()) as Record<string, unknown> }
    } catch {
      ultimoErro = "A consulta do CNPJ não respondeu a tempo. Tente de novo."
    }
  }
  return { erro: ultimoErro }
}

const SIGLAS = new Set(["LTDA", "ME", "EPP", "EIRELI", "S/A", "SA", "S.A.", "MEI", "CIA", "S/S", "SS", "LTDA.", "ME.", "EPP."])
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "por", "a", "o"])

/** "COMERCIAL DE PAPEIS SILVA LTDA" → "Comercial de Papeis Silva LTDA". */
function titulo(t: string | null): string | null {
  if (!t) return null
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => {
      const alto = p.toUpperCase()
      if (SIGLAS.has(alto)) return alto
      if (i > 0 && MINUSCULAS.has(p)) return p
      return p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join(" ")
}

function mesesDesde(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  return (Date.now() - d.getTime()) / (30.44 * 24 * 3600 * 1000)
}

/**
 * Para quem é a ficha. O cadastro público é o mesmo; muda o que vira alerta:
 * no fornecedor, o risco de contratar; no empregador (fonte pagadora dos
 * filiados), só a situação da empresa.
 */
export type PapelCnpj = "fornecedor" | "empregador"

const ALERTAS_POR_PAPEL: Record<PapelCnpj, string> = {
  fornecedor:
    "- \"alertas\": lista de frases curtas para quem vai contratar — inclua SÓ o que o registro mostra: situação cadastral diferente de ATIVA (com o motivo, se houver), empresa aberta há menos de 6 meses, MEI ou porte muito pequeno para contratos grandes, natureza jurídica incomum para fornecedor. Lista vazia se não houver nada.",
  empregador:
    "- \"alertas\": lista de frases curtas para o sindicato que representa os trabalhadores desta empresa — inclua SÓ o que o registro mostra: situação cadastral diferente de ATIVA (com o motivo, se houver) e se o CNPJ é de uma FILIAL (o empregador costuma ser cadastrado pela matriz). Lista vazia se não houver nada.",
}

const SISTEMA_BASE = `Você ajuda um sindicato a cadastrar empresas a partir do registro público da Receita Federal.
Recebe o registro em JSON e devolve um JSON com:
- "nome_razao": a razão social em caixa de título do português (preposições minúsculas; siglas societárias como LTDA, ME, EPP, S.A., EIRELI em maiúsculas). Não troque palavras.
- "nome_fantasia": o nome fantasia no mesmo padrão; se o registro não tiver, devolva "" (NÃO invente).
- "logradouro", "bairro", "cidade", "complemento": o endereço no mesmo padrão de caixa (a cidade sem a UF).
- "atividade": UMA frase curta, em português, dizendo o que a empresa faz, a partir do CNAE principal. Sem inventar.
{ALERTAS}
Use só o que está no registro. Não acrescente comentários.`

const sistema = (papel: PapelCnpj) =>
  SISTEMA_BASE.replace("{ALERTAS}", ALERTAS_POR_PAPEL[papel])

/**
 * Consulta o CNPJ e devolve a ficha pronta para o formulário. Fornecedor por
 * padrão; o empregador (fonte pagadora) passa o papel e a própria busca de
 * cadastro já existente.
 */
export async function fichaPorCnpj(
  entrada: string,
  opcoes: {
    papel?: PapelCnpj
    existente?: (cnpj: string) => Promise<{ id: string; nome: string } | null>
  } = {}
): Promise<{ ficha?: DadosCnpj; erro?: string }> {
  const papel = opcoes.papel ?? "fornecedor"
  const cnpj = entrada.replace(/\D/g, "")
  if (cnpj.length === 11) {
    return { erro: "Pessoa física: não há consulta pública de CPF. Preencha os dados à mão." }
  }
  if (cnpj.length !== 14 || !validarCnpj(cnpj)) {
    return { erro: "CNPJ inválido — confira os 14 dígitos." }
  }
  const { dados: d, erro } = await consultarReceita(cnpj)
  if (erro || !d) return { erro: erro ?? "Falha na consulta do CNPJ." }

  const situacao = s(d.descricao_situacao_cadastral) ?? s(d.situacao_cadastral)
  const abertura = s(d.data_inicio_atividade)
  const tipoLogradouro = s(d.descricao_tipo_de_logradouro)
  const logradouroBruto = s(d.logradouro)
  const logradouro =
    logradouroBruto && tipoLogradouro && !logradouroBruto.toUpperCase().startsWith(tipoLogradouro.toUpperCase())
      ? `${tipoLogradouro} ${logradouroBruto}`
      : logradouroBruto
  const telefone = s(d.ddd_telefone_1)
  const base = {
    nome_razao: s(d.razao_social),
    nome_fantasia: s(d.nome_fantasia),
    logradouro,
    bairro: s(d.bairro),
    cidade: s(d.municipio),
    complemento: s(d.complemento),
  }

  // Alertas objetivos — valem com ou sem IA.
  const alertas: string[] = []
  if (situacao && situacao.toUpperCase() !== "ATIVA") {
    const motivo = s(d.descricao_motivo_situacao_cadastral)
    alertas.push(`Situação cadastral na Receita: ${situacao}${motivo && !/sem motivo/i.test(motivo) ? ` (${motivo})` : ""}.`)
  }
  const meses = mesesDesde(abertura)
  if (papel === "fornecedor" && meses !== null && meses < 6) {
    alertas.push("Empresa aberta há menos de 6 meses — ponto de atenção da auditoria.")
  }
  // 1 = matriz, 2 = filial. O empregador costuma entrar pela matriz.
  if (papel === "empregador" && String(d.identificador_matriz_filial ?? "") === "2") {
    alertas.push("Este CNPJ é de uma filial — confira se o empregador não deve ser cadastrado pela matriz.")
  }

  let viaIA = false
  let atividade = s(d.cnae_fiscal_descricao)
  let padrao: typeof base = {
    nome_razao: titulo(base.nome_razao),
    nome_fantasia: titulo(base.nome_fantasia),
    logradouro: titulo(base.logradouro),
    bairro: titulo(base.bairro),
    cidade: titulo(base.cidade),
    complemento: titulo(base.complemento),
  }
  const registro = {
    cnpj,
    razao_social: base.nome_razao,
    nome_fantasia: base.nome_fantasia,
    situacao_cadastral: situacao,
    motivo_situacao: s(d.descricao_motivo_situacao_cadastral),
    data_inicio_atividade: abertura,
    meses_desde_abertura: meses === null ? null : Math.floor(meses),
    cnae_principal: s(d.cnae_fiscal_descricao),
    natureza_juridica: s(d.natureza_juridica),
    porte: s(d.porte) ?? s(d.descricao_porte),
    opcao_pelo_mei: d.opcao_pelo_mei ?? null,
    matriz_ou_filial: s(d.descricao_identificador_matriz_filial),
    logradouro: base.logradouro,
    complemento: base.complemento,
    bairro: base.bairro,
    municipio: base.cidade,
    uf: s(d.uf),
  }
  const ia = await gerarJsonIA({ system: sistema(papel), prompt: JSON.stringify(registro) })
  if (ia.dados) {
    viaIA = true
    const t = (k: string, reserva: string | null) => {
      const v = ia.dados?.[k]
      return typeof v === "string" ? v.trim() || null : reserva
    }
    padrao = {
      nome_razao: t("nome_razao", padrao.nome_razao),
      nome_fantasia: base.nome_fantasia ? t("nome_fantasia", padrao.nome_fantasia) : null,
      logradouro: t("logradouro", padrao.logradouro),
      bairro: t("bairro", padrao.bairro),
      cidade: t("cidade", padrao.cidade),
      complemento: t("complemento", padrao.complemento),
    }
    atividade = t("atividade", atividade)
    const extras = Array.isArray(ia.dados.alertas)
      ? ia.dados.alertas.filter((a): a is string => typeof a === "string" && a.trim() !== "")
      : []
    // Os objetivos ficam; a IA acrescenta o que não repetir.
    for (const a of extras) {
      const repetido = alertas.some((x) => x.slice(0, 20).toLowerCase() === a.slice(0, 20).toLowerCase())
      const filialRepetida = papel === "empregador" && /filial/i.test(a) && alertas.some((x) => /filial/i.test(x))
      if (!repetido && !filialRepetida && !(situacao?.toUpperCase() !== "ATIVA" && /situa[cç][aã]o/i.test(a))) alertas.push(a.trim())
    }
  }

  const existente = opcoes.existente
    ? await opcoes.existente(cnpj)
    : await buscarFornecedorExistente({ cnpjCpf: cnpj, nomes: [] }).then((e) =>
        e && e.por === "documento" ? { id: e.id, nome: e.nome } : null
      )
  const temEndereco = Boolean(base.logradouro || base.cidade)
  return {
    ficha: {
      cnpj,
      nome_razao: padrao.nome_razao,
      nome_fantasia: padrao.nome_fantasia,
      situacao,
      abertura,
      atividade,
      telefone,
      email: s(d.email)?.toLowerCase() ?? null,
      endereco: temEndereco
        ? {
            cep: s(d.cep)?.replace(/\D/g, "") ?? null,
            logradouro: padrao.logradouro,
            numero: s(d.numero),
            complemento: padrao.complemento,
            bairro: padrao.bairro,
            cidade: padrao.cidade,
            estado: s(d.uf)?.toUpperCase().slice(0, 2) ?? null,
          }
        : null,
      alertas,
      existente,
      viaIA,
    },
  }
}
