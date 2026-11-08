import "server-only"

import { esquemaAusente, hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import { vigenciaDe } from "@/lib/contratos-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * SAÚDE DOS CONTRATOS (08/11/2026) — como a saúde dos cadastros da filiação:
 * contratos em uso sem pendência ÷ contratos em uso, e a lista dos que têm
 * problema, por tipo.
 *
 * Em uso = não excluído, não é ajuda institucional, não está marcado como
 * inativo e não venceu (vence hoje ou depois, ou não tem término).
 *
 * Pendência derruba a saúde; apontamento só avisa (como na filiação).
 */

export const TIPOS_PENDENCIA_CONTRATO = [
  "arquivo",
  "fornecedor",
  "classificacao",
  "valor",
  "inicio",
  "autorizacao",
  "aditivo",
  "fornecedor_bloqueado",
] as const
export type PendenciaContrato = (typeof TIPOS_PENDENCIA_CONTRATO)[number]

export const TIPOS_APONTAMENTO_CONTRATO = ["responsavel", "termino", "vencendo"] as const
export type ApontamentoContrato = (typeof TIPOS_APONTAMENTO_CONTRATO)[number]

export const ROTULO_PROBLEMA_CONTRATO: Record<PendenciaContrato | ApontamentoContrato, string> = {
  arquivo: "Sem o arquivo do contrato",
  fornecedor: "Sem fornecedor",
  classificacao: "Sem departamento ou centro de custo",
  valor: "Sem valor",
  inicio: "Sem início da vigência",
  autorizacao: "Não autorizado",
  aditivo: "Aditivo sem o contrato principal",
  fornecedor_bloqueado: "Fornecedor bloqueado",
  responsavel: "Sem responsável",
  termino: "Sem término da vigência",
  vencendo: "Vence em até 30 dias",
}

/** O que corrigir em cada caso — vai no título do selo. */
export const DICA_PROBLEMA_CONTRATO: Record<PendenciaContrato | ApontamentoContrato, string> = {
  arquivo: "Anexe o contrato assinado em Editar.",
  fornecedor: "Escolha o fornecedor em Editar: sem ele, as ordens não têm favorecido.",
  classificacao: "Informe o departamento e o centro de custo em Editar: as ordens herdam a classificação.",
  valor: "Informe o valor em Editar (contrato sob demanda não precisa).",
  inicio: "Informe o início da vigência em Editar.",
  autorizacao: "Peça a autorização do contrato: as parcelas recorrentes dependem dela.",
  aditivo: "Ligue o aditivo ao contrato principal em Editar.",
  fornecedor_bloqueado: "O fornecedor está bloqueado no cadastro: novas ordens para ele travam.",
  responsavel: "Indique quem acompanha o contrato em Editar.",
  termino: "Prazo indeterminado: confira se o contrato não tem término.",
  vencendo: "Renove ou encerre o contrato antes do término.",
}

export type ContratoComProblema = {
  id: string
  codigo: string | null
  objeto: string | null
  fornecedorNome: string | null
  vigenciaTermino: string | null
  pendencias: PendenciaContrato[]
  apontamentos: ApontamentoContrato[]
}

export type SaudeContratos = {
  /** Contratos em uso (a base do percentual). */
  emUso: number
  /** Em uso com alguma pendência. */
  comPendencia: number
  comApontamento: number
  totais: Record<PendenciaContrato | ApontamentoContrato, number>
  /** Só os que têm pendência ou apontamento, por código. */
  linhas: ContratoComProblema[]
  disponivel: boolean
}

function zerados(): SaudeContratos["totais"] {
  return Object.fromEntries(
    [...TIPOS_PENDENCIA_CONTRATO, ...TIPOS_APONTAMENTO_CONTRATO].map((t) => [t, 0])
  ) as SaudeContratos["totais"]
}

/**
 * Varre os contratos em uso do tenant. `verSigilosos` falso esconde os de
 * categoria sigilosa (quem só lê contratos).
 */
export async function saudeContratos(opcoes: { verSigilosos: boolean }): Promise<SaudeContratos> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const vazio: SaudeContratos = { emUso: 0, comPendencia: 0, comApontamento: 0, totais: zerados(), linhas: [], disponivel: false }
  let brutos: Record<string, unknown>[]
  try {
    brutos = await lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("contratos")
        .select(
          "id, codigo, objeto, valor, vigencia_inicio, vigencia_termino, ativo, aditivo, sob_demanda, apoio_institucional, " +
            "contrato_principal_id, fornecedor_id, departamento_id, centro_custo_id, responsavel_id, categoria_id, " +
            "arquivo_contrato, autorizacao_esta_autorizado, bubble_id"
        )
        .eq("emp_proprietaria_id", emp)
        .not("deletado", "is", true)
        .order("codigo", { ascending: true, nullsFirst: false })
        .order("id")
        .range(de, ate)
    )
  } catch (e) {
    if (esquemaAusente(e as { code?: string })) return vazio
    throw new Error(`Falha ao ler contratos: ${(e as Error).message}`)
  }

  const hoje = hojeSP()
  let emUso = brutos.filter(
    (c) =>
      c.apoio_institucional !== true &&
      c.ativo !== false &&
      vigenciaDe(texto(c.vigencia_termino), hoje) !== "vencido"
  )

  const categoriaIds = [...new Set(emUso.map((c) => texto(c.categoria_id)).filter((v): v is string => !!v))]
  const fornecedorIds = [...new Set(emUso.map((c) => texto(c.fornecedor_id)).filter((v): v is string => !!v))]
  const [{ data: cats }, fornecedores] = await Promise.all([
    categoriaIds.length
      ? admin.from("contratos_categorias").select("id, sigiloso").in("id", categoriaIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    (async () => {
      const mapa = new Map<string, Record<string, unknown>>()
      for (let i = 0; i < fornecedorIds.length; i += 200) {
        const { data } = await admin
          .from("empresa")
          .select("id, nome_fantasia, nome_razao, fornecedor_bloqueado, bloqueado")
          .in("id", fornecedorIds.slice(i, i + 200))
        for (const e of data ?? []) mapa.set(String(e.id), e)
      }
      return mapa
    })(),
  ])
  if (!opcoes.verSigilosos) {
    const sigilosas = new Set(((cats ?? []) as Record<string, unknown>[]).filter((c) => c.sigiloso === true).map((c) => String(c.id)))
    emUso = emUso.filter((c) => !sigilosas.has(texto(c.categoria_id) ?? ""))
  }

  const totais = zerados()
  const linhas: ContratoComProblema[] = []
  for (const c of emUso) {
    const fornecedorId = texto(c.fornecedor_id)
    const f = fornecedorId ? fornecedores.get(fornecedorId) : undefined
    const pendencias: PendenciaContrato[] = []
    if (!texto(c.arquivo_contrato)) pendencias.push("arquivo")
    if (!fornecedorId) pendencias.push("fornecedor")
    if (!texto(c.departamento_id) || !texto(c.centro_custo_id)) pendencias.push("classificacao")
    if (!(Number(c.valor) > 0) && c.sob_demanda !== true) pendencias.push("valor")
    if (!texto(c.vigencia_inicio)) pendencias.push("inicio")
    // Migrados do Bubble não passaram pela autorização (mesma regra da página do contrato).
    if (!texto(c.bubble_id) && c.autorizacao_esta_autorizado !== true) pendencias.push("autorizacao")
    if (c.aditivo === true && !texto(c.contrato_principal_id)) pendencias.push("aditivo")
    if (f && (f.fornecedor_bloqueado === true || f.bloqueado === true)) pendencias.push("fornecedor_bloqueado")

    const apontamentos: ApontamentoContrato[] = []
    if (!texto(c.responsavel_id)) apontamentos.push("responsavel")
    const vigencia = vigenciaDe(texto(c.vigencia_termino), hoje)
    if (vigencia === "sem_termo") apontamentos.push("termino")
    if (vigencia === "vencendo") apontamentos.push("vencendo")

    for (const t of [...pendencias, ...apontamentos]) totais[t]++
    if (pendencias.length || apontamentos.length) {
      linhas.push({
        id: String(c.id),
        codigo: texto(c.codigo),
        objeto: texto(c.objeto),
        fornecedorNome: f ? (texto(f.nome_fantasia) ?? texto(f.nome_razao)) : null,
        vigenciaTermino: texto(c.vigencia_termino),
        pendencias,
        apontamentos,
      })
    }
  }

  return {
    emUso: emUso.length,
    comPendencia: linhas.filter((l) => l.pendencias.length > 0).length,
    comApontamento: linhas.filter((l) => l.apontamentos.length > 0).length,
    totais,
    linhas,
    disponivel: true,
  }
}
