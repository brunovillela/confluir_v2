import "server-only"

import { filiadosAtivos } from "@/lib/db/filiacao-ativos"
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
 * DEFINIÇÃO DE ATIVO: a condição do cadastro — ver `filiacao-ativos.ts`, que
 * guarda a régua e o motivo de ela não sair mais do histórico de vínculos.
 *
 * Consequência de ler o cadastro: entram na lista pessoas que **não têm
 * vínculo nenhum**. Não é ruído — é a pior categoria das três. Sem vínculo não
 * há onde anexar a ficha nem de onde tirar fonte pagadora e data de filiação;
 * é preciso criar o histórico antes de cobrar o documento. São cerca de 5.900
 * cadastros ativos, herança de um backfill do Bubble que cobriu metade da base.
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
  ficha_filiacao: string | null
  fonte_pagadora_id: string | null
}

export type FiliadoSemFicha = {
  filiadoId: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  /** Nulo quando a pessoa não tem NENHUM vínculo — não há onde anexar. */
  vinculoId: string | null
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
  /** Ativos sem NENHUM vínculo: falta o histórico antes da ficha. */
  semHistorico: number
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

export async function fichasPendentes(): Promise<FichasPendentes> {
  if (cache && cache.expira > Date.now()) return cache.dados

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const ativos = await filiadosAtivos()

  const vinculos = await lerLotes<LinhaVinculo>((de, ate) =>
    admin
      .from("filiacao_vinculos")
      .select(
        "id, filiado_id, data_filiacao, filiacao_data_adesao, ficha_filiacao, fonte_pagadora_id"
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

  // Percorre os ATIVOS, não os vínculos: quem não tem vínculo também é
  // cobrado — e é quem mais precisa aparecer.
  const pendentes: { filiadoId: string; vinculo: LinhaVinculo | null }[] = []
  let semHistorico = 0
  for (const filiadoId of ativos.keys()) {
    const v = ultimoPorFiliado.get(filiadoId) ?? null
    if (!v) {
      semHistorico++
      pendentes.push({ filiadoId, vinculo: null })
      continue
    }
    if (ehArquivo(v.ficha_filiacao)) continue
    pendentes.push({ filiadoId, vinculo: v })
  }
  const ativosSemFicha = pendentes
    .map((p) => p.vinculo)
    .filter((v): v is LinhaVinculo => v !== null)

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

  const semFicha: FiliadoSemFicha[] = pendentes
    .map(({ filiadoId, vinculo }) => {
      const f = ativos.get(filiadoId)
      return {
        filiadoId,
        nome: f?.nome ?? null,
        cpf: f?.cpf ?? null,
        matricula: f?.matricula ?? null,
        vinculoId: vinculo?.id ?? null,
        fonteNome: vinculo?.fonte_pagadora_id
          ? (nomesFontes.get(vinculo.fonte_pagadora_id) ?? null)
          : null,
        dataFiliacao:
          vinculo?.data_filiacao ?? vinculo?.filiacao_data_adesao ?? null,
        temFichaEmOutroVinculo: temFichaEmAlgum.has(filiadoId),
      }
    })
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))

  const dados: FichasPendentes = {
    ativos: ativos.size,
    semFicha,
    comFichaAntiga: semFicha.filter((s) => s.temFichaEmOutroVinculo).length,
    semHistorico,
    geradoEm: new Date().toISOString(),
  }
  cache = { dados, expira: Date.now() + VALIDADE_CACHE_MS }
  return dados
}
