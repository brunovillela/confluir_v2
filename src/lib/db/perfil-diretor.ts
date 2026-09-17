import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { obterFichaDiretor, type FichaDiretor } from "@/lib/db/diretoria"
import { origemDaFicha } from "@/lib/db/diretoria-ficha"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Meu perfil — a parte de DIRETOR. Diretor não tem contracheque, ponto, nível
 * salarial nem férias; o que é dele é o mandato, a liberação sindical pela
 * empresa de origem, as instâncias em que representa a entidade, os custeios
 * pagos em seu nome e a ficha de diretor (contato, dados bancários).
 *
 * O usuário é diretor quando é integrante de um mandato VIGENTE — ligado pela
 * conta (`usuario_id`) ou pelo CPF. Pode ser funcionário e diretor ao mesmo
 * tempo; o perfil mostra as duas partes.
 */

const hojeISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())

export type DiretoriaDoUsuario = {
  integranteId: string
  cargo: string | null
  grupoNome: string | null
  mandatoNome: string | null
  mandatoInicio: string | null
  mandatoTermino: string | null
}

/** Integrante do mandato vigente (pela conta ou pelo CPF), ou null. */
export async function diretoriaDoUsuario(
  usuarioId: string,
  cpf: string | null
): Promise<DiretoriaDoUsuario | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeISO()
  const { data: mandatos, error } = await admin
    .from("diretoria_mandatos")
    .select("id, mandato, data_inicio, data_termino")
    .eq("emp_proprietaria_id", emp)
  if (error || !mandatos?.length) return null
  const vigentes = mandatos.filter((m) => {
    const inicio = texto(m.data_inicio)
    const termino = texto(m.data_termino)
    if (!inicio && !termino) return false
    return (!inicio || inicio <= hoje) && (!termino || termino >= hoje)
  })
  if (vigentes.length === 0) return null

  const digitos = (cpf ?? "").replace(/\D/g, "")
  const filtro = digitos.length === 11 ? `usuario_id.eq.${usuarioId},cpf.eq.${digitos}` : `usuario_id.eq.${usuarioId}`
  // "*": grupo_id e cpf só existem depois de supabase/diretoria-grupos.sql.
  let { data: integrantes, error: erroInt } = await admin
    .from("diretoria_integrantes")
    .select("*")
    .in("mandato_id", vigentes.map((m) => m.id))
    .or(filtro)
  if (erroInt && digitos) {
    ;({ data: integrantes, error: erroInt } = await admin
      .from("diretoria_integrantes")
      .select("*")
      .in("mandato_id", vigentes.map((m) => m.id))
      .eq("usuario_id", usuarioId))
  }
  const integrante = (integrantes ?? []).sort((a, b) => Number(a.ordem ?? 99) - Number(b.ordem ?? 99))[0]
  if (erroInt || !integrante) return null

  const mandato = vigentes.find((m) => m.id === integrante.mandato_id)
  let grupoNome: string | null = null
  if (integrante.grupo_id) {
    const { data: g } = await admin.from("diretoria_grupos").select("nome").eq("id", integrante.grupo_id).maybeSingle()
    grupoNome = texto(g?.nome)
  }
  return {
    integranteId: String(integrante.id),
    cargo: texto(integrante.cargo),
    grupoNome,
    mandatoNome: texto(mandato?.mandato),
    mandatoInicio: texto(mandato?.data_inicio),
    mandatoTermino: texto(mandato?.data_termino),
  }
}

export type MinhaLiberacao = {
  id: string
  empresaNome: string | null
  tipo: string | null
  inicio: string | null
  fim: string | null
  observacao: string | null
  vigente: boolean
}

export type MeuAssento = {
  id: string
  instanciaNome: string | null
  cargo: string | null
  inicio: string | null
  fim: string | null
}

export type MeuCusteio = {
  id: string
  codigo: string | null
  descricao: string | null
  situacao: string
  cadencia: string
  valorParcela: number | null
  numParcelas: number
  primeiroVencimento: string | null
  ordensPagas: number
  ordensTotal: number
}

export type AreaDoDiretor = {
  liberacoes: MinhaLiberacao[]
  assentos: MeuAssento[]
  custeios: MeuCusteio[]
  ficha: FichaDiretor | null
  /**
   * Lotações dos vínculos em aberto da filiação ("Refinaria · Petro Fictícia").
   * null = diretor sem filiação: vale a base operacional da ficha.
   */
  lotacoes: string[] | null
}

/** Tudo o que o Meu perfil mostra ao diretor. Cada bloco degrada para vazio. */
export async function areaDoDiretor(integranteId: string): Promise<AreaDoDiretor> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeISO()

  const [liberacoesRes, assentosRes, custeiosRes, ficha, origem] = await Promise.all([
    admin
      .from("diretoria_liberacoes")
      .select("id, empresa_id, tipo, inicio, fim, observacao")
      .eq("integrante_id", integranteId)
      .order("inicio", { ascending: false, nullsFirst: false }),
    admin
      .from("diretoria_instancia_assentos")
      .select("id, instancia_id, cargo, mandato_inicio, mandato_fim")
      .eq("integrante_id", integranteId),
    admin
      .from("institucional_custeios")
      .select("id, codigo, descricao, situacao, cadencia, valor_parcela, num_parcelas, primeiro_vencimento")
      .eq("emp_proprietaria_id", emp)
      .eq("diretoria_integrante_id", integranteId)
      .not("excluido", "is", true)
      .order("created_at", { ascending: false })
      .limit(50),
    obterFichaDiretor(integranteId).catch(() => null),
    origemDaFicha(integranteId).catch(() => null),
  ])

  const empresaIds = [...new Set((liberacoesRes.data ?? []).map((l) => texto(l.empresa_id)).filter(Boolean))] as string[]
  const instanciaIds = [...new Set((assentosRes.data ?? []).map((a) => texto(a.instancia_id)).filter(Boolean))] as string[]
  const custeioIds = (custeiosRes.data ?? []).map((c) => String(c.id))
  const [empresas, instancias, ordens] = await Promise.all([
    empresaIds.length
      ? admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", empresaIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    instanciaIds.length
      ? admin.from("diretoria_instancias").select("id, nome").in("id", instanciaIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    custeioIds.length
      ? admin.from("ordens_pagamento").select("custeio_id, situacao").in("custeio_id", custeioIds).not("excluido", "is", true)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const nomeEmpresa = new Map(
    (empresas.data ?? []).map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao)])
  )
  const nomeInstancia = new Map((instancias.data ?? []).map((i) => [String(i.id), texto(i.nome)]))

  const logar = (bloco: string, erro: { message: string } | null) => {
    if (erro && !esquemaAusente(erro as { code?: string })) console.error(`Meu perfil do diretor (${bloco}):`, erro.message)
  }
  logar("liberações", liberacoesRes.error)
  logar("instâncias", assentosRes.error)
  logar("custeios", custeiosRes.error)

  return {
    liberacoes: (liberacoesRes.data ?? []).map((l) => {
      const inicio = texto(l.inicio)
      const fim = texto(l.fim)
      return {
        id: String(l.id),
        empresaNome: l.empresa_id ? (nomeEmpresa.get(String(l.empresa_id)) ?? null) : null,
        tipo: texto(l.tipo),
        inicio,
        fim,
        observacao: texto(l.observacao),
        vigente: (!inicio || inicio <= hoje) && (!fim || fim >= hoje),
      }
    }),
    assentos: (assentosRes.data ?? []).map((a) => ({
      id: String(a.id),
      instanciaNome: a.instancia_id ? (nomeInstancia.get(String(a.instancia_id)) ?? null) : null,
      cargo: texto(a.cargo),
      inicio: texto(a.mandato_inicio),
      fim: texto(a.mandato_fim),
    })),
    custeios: (custeiosRes.data ?? []).map((c) => {
      const minhas = (ordens.data ?? []).filter((o) => String(o.custeio_id) === String(c.id))
      return {
        id: String(c.id),
        codigo: texto(c.codigo),
        descricao: texto(c.descricao),
        situacao: String(c.situacao),
        cadencia: String(c.cadencia),
        valorParcela: typeof c.valor_parcela === "number" ? c.valor_parcela : null,
        numParcelas: typeof c.num_parcelas === "number" ? c.num_parcelas : 1,
        primeiroVencimento: texto(c.primeiro_vencimento),
        ordensPagas: minhas.filter((o) => o.situacao === "Paga").length,
        ordensTotal: minhas.length,
      }
    }),
    ficha,
    lotacoes: origem?.filiacao
      ? origem.vinculos.map((v) => [v.lotacao, v.empresa].filter(Boolean).join(" · ")).filter(Boolean)
      : null,
  }
}
