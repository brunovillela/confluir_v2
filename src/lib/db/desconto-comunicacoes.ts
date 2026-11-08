import "server-only"

import { esquemaAusente, lerEmLotes, lerEmLotesPorIds } from "@/lib/db/comum"
import { listarRemessas } from "@/lib/db/receitas"
import { regrasRepasse, unidadesDeRepasse, AVISO_SQL_REPASSE } from "@/lib/db/repasse"
import { formatarCnpjCpf } from "@/lib/formato"
import { regraEfetiva } from "@/lib/repasse"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Inclusões e exclusões de desconto em folha a comunicar às empresas
 * (08/11/2026). Inclusão = vínculo com filiação a partir do início do
 * controle; exclusão = vínculo com desfiliação a partir dele. Fica pendente
 * até entrar numa comunicação registrada (filiacao_desconto_comunicacoes),
 * que guarda o snapshot do que foi enviado. Quem paga por Pix ou boleto não
 * tem desconto em folha e não entra.
 */

export type AcaoDesconto = "inclusao" | "exclusao"

export type ItemDesconto = {
  vinculoId: string
  filiadoId: string | null
  nome: string
  cpf: string | null
  matricula: string | null
  data: string
  acao: AcaoDesconto
  /** Empresa que recebe a comunicação (no grupo centralizado, a pagadora). */
  empresaId: string
  /** Fonte do vínculo (difere de empresaId no grupo centralizado). */
  fonteId: string
}

type VinculoBruto = {
  id: string
  filiado_id: string | null
  fonte_pagadora_id: string | null
  data_filiacao: string | null
  data_desfiliacao: string | null
  matricula: string | null
  fonte_pg_matricula: string | null
}

const FORMAS_SEM_FOLHA = new Set(["pix", "boleto"])

/** Primeiro dia da competência AAAAMM. */
const diaInicial = (c: number) => `${Math.floor(c / 100)}-${String(c % 100).padStart(2, "0")}-01`

export type PendenciasDesconto = {
  disponivel: boolean
  /** null = o controle não foi ativado (sem data de início). */
  desde: number | null
  itens: ItemDesconto[]
}

export async function pendenciasDeDesconto(empresaId?: string): Promise<PendenciasDesconto> {
  const regras = await regrasRepasse()
  if (!regras.disponivel || regras.desde === null) {
    return { disponivel: regras.disponivel, desde: regras.desde, itens: [] }
  }
  const desdeDia = diaInicial(regras.desde)
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const colunas = "id, filiado_id, fonte_pagadora_id, data_filiacao, data_desfiliacao, matricula, fonte_pg_matricula"
  const [filiacoes, desfiliacoes, { unidadeDaFonte }] = await Promise.all([
    lerEmLotes<VinculoBruto>((a, b) =>
      admin
        .from("filiacao_vinculos")
        .select(colunas)
        .eq("emp_proprietaria_id", emp)
        .not("fonte_pagadora_id", "is", null)
        .gte("data_filiacao", desdeDia)
        .order("id")
        .range(a, b)
    ),
    lerEmLotes<VinculoBruto>((a, b) =>
      admin
        .from("filiacao_vinculos")
        .select(colunas)
        .eq("emp_proprietaria_id", emp)
        .not("fonte_pagadora_id", "is", null)
        .gte("data_desfiliacao", desdeDia)
        .order("id")
        .range(a, b)
    ),
    unidadesDeRepasse(),
  ])
  const vinculos = new Map<string, VinculoBruto>()
  for (const v of [...filiacoes, ...desfiliacoes]) vinculos.set(v.id, v)
  const daEmpresa = [...vinculos.values()].filter((v) => {
    const unidade = unidadeDaFonte.get(v.fonte_pagadora_id!) ?? v.fonte_pagadora_id!
    if (empresaId && unidade !== empresaId) return false
    return regraEfetiva("Associativa", regras.geral.Associativa, regras.porEmpresa.get(unidade)?.Associativa).controla
  })
  if (daEmpresa.length === 0) return { disponivel: true, desde: regras.desde, itens: [] }

  const [enviados, pessoas] = await Promise.all([
    lerEmLotesPorIds<{ id: string; vinculo_id: string; acao: string }>(
      daEmpresa.map((v) => v.id),
      (fatia, a, b) =>
        admin
          .from("filiacao_desconto_comunicacao_itens")
          .select("id, vinculo_id, acao")
          .eq("emp_proprietaria_id", emp)
          .in("vinculo_id", fatia)
          .order("vinculo_id")
          .order("id")
          .range(a, b)
    ),
    lerEmLotesPorIds<{ id: string; nome_completo: string | null; cpf: string | null; forma_recebimento: string | null }>(
      daEmpresa.flatMap((v) => (v.filiado_id ? [v.filiado_id] : [])),
      (fatia, a, b) =>
        admin
          .from("filiacoes")
          .select("id, nome_completo, cpf, forma_recebimento")
          .eq("emp_proprietaria_id", emp)
          .in("id", fatia)
          .order("id")
          .range(a, b)
    ),
  ])
  const ja = new Set(enviados.map((e) => `${e.vinculo_id}|${e.acao}`))
  const pessoa = new Map(pessoas.map((p) => [p.id, p]))
  const itens: ItemDesconto[] = []
  for (const v of daEmpresa) {
    const p = v.filiado_id ? pessoa.get(v.filiado_id) : undefined
    if (p?.forma_recebimento && FORMAS_SEM_FOLHA.has(p.forma_recebimento)) continue
    const unidade = unidadeDaFonte.get(v.fonte_pagadora_id!) ?? v.fonte_pagadora_id!
    const comum = {
      vinculoId: v.id,
      filiadoId: v.filiado_id,
      nome: p?.nome_completo ?? "(sem nome)",
      cpf: p?.cpf ?? null,
      matricula: v.fonte_pg_matricula ?? v.matricula,
      empresaId: unidade,
      fonteId: v.fonte_pagadora_id!,
    }
    const entrouNoControle = !!v.data_filiacao && v.data_filiacao >= desdeDia
    const inclusaoEnviada = ja.has(`${v.id}|inclusao`)
    // Entrou e saiu sem que a empresa soubesse da entrada: nada a comunicar.
    const saiuSemEntrar = entrouNoControle && !inclusaoEnviada
    if (entrouNoControle && !inclusaoEnviada && !v.data_desfiliacao) {
      itens.push({ ...comum, data: v.data_filiacao!, acao: "inclusao" })
    }
    if (v.data_desfiliacao && v.data_desfiliacao >= desdeDia && !ja.has(`${v.id}|exclusao`) && !saiuSemEntrar) {
      itens.push({ ...comum, data: v.data_desfiliacao, acao: "exclusao" })
    }
  }
  itens.sort((a, b) => b.acao.localeCompare(a.acao) || a.nome.localeCompare(b.nome, "pt-BR"))
  return { disponivel: true, desde: regras.desde, itens }
}

const cacheContagem = new Map<string, { expira: number; valor: Map<string, { inclusoes: number; exclusoes: number }> }>()

export function invalidarContagemDesconto() {
  cacheContagem.clear()
}

/** Quantas pendências por empresa (para o quadro e os avisos). Cache de 10 minutos. */
export async function contagemPendenciasDesconto(): Promise<Map<string, { inclusoes: number; exclusoes: number }>> {
  const emp = await tenantAtual()
  const c = cacheContagem.get(emp)
  if (c && c.expira > Date.now()) return c.valor
  const { itens } = await pendenciasDeDesconto()
  const porEmpresa = new Map<string, { inclusoes: number; exclusoes: number }>()
  for (const i of itens) {
    const c = porEmpresa.get(i.empresaId) ?? { inclusoes: 0, exclusoes: 0 }
    if (i.acao === "inclusao") c.inclusoes++
    else c.exclusoes++
    porEmpresa.set(i.empresaId, c)
  }
  cacheContagem.set(emp, { expira: Date.now() + 10 * 60_000, valor: porEmpresa })
  return porEmpresa
}

export async function registrarComunicacao(dados: {
  empresaId: string
  vinculos: { vinculoId: string; acao: AcaoDesconto }[]
  meio: string
  destinatario: string | null
  referencia: string | null
  observacao: string | null
  usuarioId: string | null
  usuarioNome: string | null
}): Promise<{ id?: string; itens?: ItemDesconto[]; erro?: string }> {
  if (dados.vinculos.length === 0) return { erro: "Marque ao menos uma pessoa." }
  const { itens: pendentes } = await pendenciasDeDesconto(dados.empresaId)
  const escolhidos = new Set(dados.vinculos.map((v) => `${v.vinculoId}|${v.acao}`))
  const itens = pendentes.filter((i) => escolhidos.has(`${i.vinculoId}|${i.acao}`))
  if (itens.length === 0) return { erro: "Essas pessoas já foram comunicadas ou não estão mais pendentes. Recarregue a página." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: cab, error } = await admin
    .from("filiacao_desconto_comunicacoes")
    .insert({
      emp_proprietaria_id: emp,
      empresa_id: dados.empresaId,
      meio: dados.meio,
      destinatario: dados.destinatario,
      referencia: dados.referencia,
      observacao: dados.observacao,
      inclusoes: itens.filter((i) => i.acao === "inclusao").length,
      exclusoes: itens.filter((i) => i.acao === "exclusao").length,
      usuario_id: dados.usuarioId,
      usuario_nome: dados.usuarioNome,
    })
    .select("id")
    .single()
  if (error || !cab) {
    return { erro: error && esquemaAusente(error) ? AVISO_SQL_REPASSE : `Não foi possível registrar: ${error?.message}` }
  }
  const { error: erroItens } = await admin.from("filiacao_desconto_comunicacao_itens").insert(
    itens.map((i) => ({
      emp_proprietaria_id: emp,
      comunicacao_id: cab.id,
      vinculo_id: i.vinculoId,
      filiado_id: i.filiadoId,
      acao: i.acao,
      nome: i.nome,
      cpf: i.cpf,
      matricula: i.matricula,
      data: i.data,
    }))
  )
  if (erroItens) return { erro: `A comunicação foi registrada, mas os nomes não: ${erroItens.message}` }
  return { id: cab.id, itens }
}

// ── Histórico e conferência pela relação ────────────────────────────────────

export type ComunicacaoDesconto = {
  id: string
  enviadoEm: string
  meio: string
  destinatario: string | null
  referencia: string | null
  observacao: string | null
  inclusoes: number
  exclusoes: number
  usuarioNome: string | null
  itens: (Omit<ItemDesconto, "empresaId" | "fonteId" | "vinculoId"> & {
    vinculoId: string | null
    /** Conferência pela relação da empresa depois do envio. */
    conferencia: { ok: boolean; texto: string } | null
  })[]
}

export async function comunicacoesDaEmpresa(empresaId: string, fontes: string[], limite = 20): Promise<ComunicacaoDesconto[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: cabs, error } = await admin
    .from("filiacao_desconto_comunicacoes")
    .select("id, enviado_em, meio, destinatario, referencia, observacao, inclusoes, exclusoes, usuario_nome")
    .eq("emp_proprietaria_id", emp)
    .eq("empresa_id", empresaId)
    .order("enviado_em", { ascending: false })
    .limit(limite)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler as comunicações: ${error.message}`)
  }
  if (!cabs?.length) return []
  const itens = await lerEmLotesPorIds<{
    id: string
    comunicacao_id: string
    vinculo_id: string | null
    filiado_id: string | null
    acao: AcaoDesconto
    nome: string | null
    cpf: string | null
    matricula: string | null
    data: string | null
  }>(
    cabs.map((c) => c.id),
    (fatia, a, b) =>
      admin
        .from("filiacao_desconto_comunicacao_itens")
        .select("id, comunicacao_id, vinculo_id, filiado_id, acao, nome, cpf, matricula, data")
        .eq("emp_proprietaria_id", emp)
        .in("comunicacao_id", fatia)
        .order("comunicacao_id")
        .order("id")
        .range(a, b)
  )

  // Conferência: a pessoa aparece (ou não) nas relações da empresa com
  // competência do mês do envio em diante.
  const remessas = new Map((await listarRemessas()).map((r) => [r.id, r]))
  const filiados = [...new Set(itens.flatMap((i) => (i.filiado_id ? [i.filiado_id] : [])))]
  const vistos = new Map<string, number[]>()
  const ultimaCompetenciaDaEmpresa = { valor: 0 }
  if (filiados.length && fontes.length) {
    const linhas = await lerEmLotesPorIds<{ id: string; filiado_id: string; remessa_id: string; fonte_pg_id: string }>(
      filiados,
      (fatia, a, b) =>
        admin
          .from("filiacao_recebe")
          .select("id, filiado_id, remessa_id, fonte_pg_id")
          .eq("emp_proprietaria_id", emp)
          .in("filiado_id", fatia)
          .in("fonte_pg_id", fontes)
          .order("filiado_id")
          .order("id")
          .range(a, b)
    )
    for (const l of linhas) {
      const r = remessas.get(l.remessa_id)
      if (!r?.ordem || (r.tipo ?? "Associativa") !== "Associativa") continue
      vistos.set(l.filiado_id, [...(vistos.get(l.filiado_id) ?? []), r.ordem])
    }
  }
  // A competência mais recente que a empresa já mandou (para dizer "ainda não").
  if (fontes.length) {
    const maisAntigo = Math.min(...cabs.map((c) => Number(c.enviado_em.slice(0, 4)) * 100 + Number(c.enviado_em.slice(5, 7))))
    const { data: resumo } = await admin.rpc("filiacao_repasse_resumo", { p_emp: emp, p_de: maisAntigo, p_ate: 210012 })
    const daEmpresa = new Set(fontes)
    for (const r of (resumo ?? []) as { ordem: number; tipo: string; fonte_id: string }[]) {
      if (r.tipo === "Associativa" && daEmpresa.has(r.fonte_id) && r.ordem > ultimaCompetenciaDaEmpresa.valor) {
        ultimaCompetenciaDaEmpresa.valor = r.ordem
      }
    }
  }
  const rot = (c: number) => `${String(c % 100).padStart(2, "0")}/${Math.floor(c / 100)}`

  return cabs.map((c) => {
    const mesEnvio = Number(c.enviado_em.slice(0, 4)) * 100 + Number(c.enviado_em.slice(5, 7))
    return {
      id: c.id,
      enviadoEm: c.enviado_em,
      meio: c.meio,
      destinatario: c.destinatario,
      referencia: c.referencia,
      observacao: c.observacao,
      inclusoes: c.inclusoes,
      exclusoes: c.exclusoes,
      usuarioNome: c.usuario_nome,
      itens: itens
        .filter((i) => i.comunicacao_id === c.id)
        .map((i) => {
          const depois = (i.filiado_id ? (vistos.get(i.filiado_id) ?? []) : []).filter((o) => o >= mesEnvio)
          const ultima = ultimaCompetenciaDaEmpresa.valor
          let conferencia: { ok: boolean; texto: string } | null = null
          if (ultima >= mesEnvio) {
            if (i.acao === "inclusao") {
              conferencia = depois.length
                ? { ok: true, texto: `Descontado em ${rot(Math.min(...depois))}` }
                : { ok: false, texto: `Ainda sem desconto (relação de ${rot(ultima)})` }
            } else {
              conferencia = depois.includes(ultima)
                ? { ok: false, texto: `Ainda descontado em ${rot(ultima)}` }
                : { ok: true, texto: `Sem desconto em ${rot(ultima)}` }
            }
          }
          return {
            vinculoId: i.vinculo_id,
            filiadoId: i.filiado_id,
            nome: i.nome ?? "(sem nome)",
            cpf: i.cpf,
            matricula: i.matricula,
            data: i.data ?? "",
            acao: i.acao,
            conferencia,
          }
        }),
    }
  })
}

// ── Planilha (CSV) ──────────────────────────────────────────────────────────

const celula = (v: string) => (/[;"\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)
const dataBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "")

/** CSV (separado por ;, com BOM para o Excel) das inclusões e exclusões. */
export function csvDesconto(itens: Pick<ItemDesconto, "acao" | "nome" | "cpf" | "matricula" | "data">[]): string {
  const linhas = [
    ["Ação", "Nome", "CPF", "Matrícula", "A partir de"],
    ...itens.map((i) => [
      i.acao === "inclusao" ? "Incluir desconto" : "Excluir desconto",
      i.nome,
      i.cpf ? formatarCnpjCpf(i.cpf) : "",
      i.matricula ?? "",
      dataBr(i.data),
    ]),
  ]
  return "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n")
}

export { dataBr }
