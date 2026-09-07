import "server-only"

import { ehArquivo } from "@/lib/db/filiacao-documentos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Filiados ATIVOS que não têm ficha de filiação registrada.
 *
 * A ficha assinada é o que autoriza o desconto e prova a vontade de se filiar.
 * Filiado ativo sem ficha é exposição da entidade — e, até aqui, invisível:
 * dava para saber abrindo cada cadastro, um a um, entre milhares.
 *
 * DEFINIÇÃO DE ATIVO: vale o ÚLTIMO registro do histórico de vínculos — o de
 * data de filiação mais recente — e ele precisa estar EM ABERTO, isto é, sem
 * data de desfiliação. Vínculos antigos, encerrados, não contam: a pessoa pode
 * ter se desfiliado de um emprego e se filiado por outro.
 *
 * NÃO uso `filiacao_vinculos.filiacao_condicao`: a coluna existe, mas a
 * migração a deixou NULA em 10.823 dos 10.824 vínculos — ler por ali daria 1
 * filiado ativo em vez de 8.155. "Vínculo em aberto" é a derivação que o
 * próprio sistema já usa na ficha do filiado.
 *
 * A varredura passa por todos os vínculos do tenant (mais de dez mil), então o
 * resultado é CACHEADO — a resposta muda devagar, e a alternativa seria uma
 * espera de segundos a cada abertura da tela.
 */

const VALIDADE_CACHE_MS = 10 * 60 * 1000

type LinhaVinculo = {
  id: string
  filiado_id: string | null
  data_filiacao: string | null
  filiacao_data_adesao: string | null
  data_desfiliacao: string | null
  filiacao_data_saida: string | null
  ficha_filiacao: string | null
  fonte_pagadora_id: string | null
}

export type FiliadoSemFicha = {
  filiadoId: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  vinculoId: string
  fonteNome: string | null
  dataFiliacao: string | null
  /** Tem ficha em ALGUM vínculo antigo? Muda o que a secretaria faz. */
  temFichaEmOutroVinculo: boolean
}

export type FichasPendentes = {
  ativos: number
  semFicha: FiliadoSemFicha[]
  /** Ativos cujo vínculo corrente não tem ficha, mas outro vínculo tem. */
  comFichaAntiga: number
  geradoEm: string
}

let cache: { dados: FichasPendentes; expira: number } | null = null

export function invalidarCacheFichasPendentes() {
  cache = null
}

async function lerLotes<T>(
  consulta: (
    de: number,
    ate: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const LOTE = 1000
  const linhas: T[] = []
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await consulta(de, de + LOTE - 1)
    if (error) throw new Error(`Falha ao varrer vínculos: ${error.message}`)
    linhas.push(...(data ?? []))
    if (!data || data.length < LOTE) break
  }
  return linhas
}

/** A data que ordena o histórico; `data_filiacao` manda, adesão é o reserva. */
function dataDeFiliacao(v: LinhaVinculo): string {
  return v.data_filiacao ?? v.filiacao_data_adesao ?? ""
}

/** Vínculo em aberto = ninguém encerrou. As duas colunas existem por herança. */
function emAberto(v: LinhaVinculo): boolean {
  return !v.data_desfiliacao && !v.filiacao_data_saida
}

export async function fichasPendentes(): Promise<FichasPendentes> {
  if (cache && cache.expira > Date.now()) return cache.dados

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const vinculos = await lerLotes<LinhaVinculo>((de, ate) =>
    admin
      .from("filiacao_vinculos")
      .select(
        "id, filiado_id, data_filiacao, filiacao_data_adesao, data_desfiliacao, filiacao_data_saida, ficha_filiacao, fonte_pagadora_id"
      )
      .eq("emp_proprietaria_id", emp)
      .not("filiado_id", "is", null)
      // .order("id") mantém a paginação estável: sem ele, linhas repetem ou
      // somem entre um lote e o seguinte.
      .order("id", { ascending: true })
      .range(de, ate)
  )

  // Último vínculo de cada filiado, pela data de filiação mais recente.
  const ultimoPorFiliado = new Map<string, LinhaVinculo>()
  const temFichaEmAlgum = new Set<string>()
  for (const v of vinculos) {
    const filiadoId = v.filiado_id as string
    if (ehArquivo(v.ficha_filiacao)) temFichaEmAlgum.add(filiadoId)

    const atual = ultimoPorFiliado.get(filiadoId)
    if (!atual || dataDeFiliacao(v) > dataDeFiliacao(atual)) {
      ultimoPorFiliado.set(filiadoId, v)
    }
  }

  const ativosSemFicha: LinhaVinculo[] = []
  let ativos = 0
  for (const v of ultimoPorFiliado.values()) {
    if (!emAberto(v)) continue
    ativos++
    if (!ehArquivo(v.ficha_filiacao)) ativosSemFicha.push(v)
  }

  // Nome, CPF e fonte só de quem entra na lista — não dos dez mil.
  const idsFiliados = ativosSemFicha
    .map((v) => v.filiado_id as string)
    .filter(Boolean)
  const dadosFiliado = new Map<
    string,
    { nome: string | null; cpf: string | null; matricula: string | null }
  >()
  for (let de = 0; de < idsFiliados.length; de += 200) {
    const { data } = await admin
      .from("filiacoes")
      .select("id, nome_completo, cpf, matricula_sindical")
      .in("id", idsFiliados.slice(de, de + 200))
    for (const f of data ?? []) {
      dadosFiliado.set(f.id as string, {
        nome: (f.nome_completo as string | null) ?? null,
        cpf: (f.cpf as string | null) ?? null,
        matricula: (f.matricula_sindical as string | null) ?? null,
      })
    }
  }

  const idsFontes = [
    ...new Set(
      ativosSemFicha
        .map((v) => v.fonte_pagadora_id)
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const nomesFontes = new Map<string, string>()
  for (let de = 0; de < idsFontes.length; de += 200) {
    const { data } = await admin
      .from("empresa")
      .select("id, empresa, nome_fantasia, nome_razao")
      .in("id", idsFontes.slice(de, de + 200))
    for (const e of data ?? []) {
      const nome = [e.empresa, e.nome_fantasia, e.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      )
      if (nome) nomesFontes.set(e.id as string, nome)
    }
  }

  const semFicha: FiliadoSemFicha[] = ativosSemFicha
    .map((v) => {
      const filiadoId = v.filiado_id as string
      const f = dadosFiliado.get(filiadoId)
      return {
        filiadoId,
        nome: f?.nome ?? null,
        cpf: f?.cpf ?? null,
        matricula: f?.matricula ?? null,
        vinculoId: v.id,
        fonteNome: v.fonte_pagadora_id
          ? (nomesFontes.get(v.fonte_pagadora_id) ?? null)
          : null,
        dataFiliacao: v.data_filiacao ?? v.filiacao_data_adesao,
        temFichaEmOutroVinculo: temFichaEmAlgum.has(filiadoId),
      }
    })
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))

  const dados: FichasPendentes = {
    ativos,
    semFicha,
    comFichaAntiga: semFicha.filter((s) => s.temFichaEmOutroVinculo).length,
    geradoEm: new Date().toISOString(),
  }
  cache = { dados, expira: Date.now() + VALIDADE_CACHE_MS }
  return dados
}
