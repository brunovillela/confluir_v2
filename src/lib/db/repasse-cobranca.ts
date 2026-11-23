import "server-only"

import { hojeSP } from "@/lib/db/comum"
import { dataBr } from "@/lib/db/desconto-comunicacoes"
import {
  DIAS_SILENCIO_COBRANCA,
  invalidarAvisosRepasse,
  quadroRepasse,
  registrarEventoRepasse,
  regrasRepasse,
  tiposControlados,
  unidadesDeRepasse,
  type ContatoFolha,
} from "@/lib/db/repasse"
import { enviarEmail } from "@/lib/email"
import { escaparHtml, paragrafo, tituloEmail } from "@/lib/email-layout"
import { formatarMoeda } from "@/lib/formato"
import { rotuloCompetencia, type TipoContribuicao } from "@/lib/repasse"
import { createAdminClient } from "@/lib/supabase/admin"
import { origemAtual } from "@/lib/tenant-url"
import { tenantAtual } from "@/lib/tenant"

/**
 * Cobrança em lote e contatos da folha (15/11/2026). Um e-mail por empresa,
 * com todas as competências atrasadas (relação e/ou depósito), registrado na
 * trilha de cada uma; e a lista de empresas sem contato da folha, com os
 * contatos que a empresa já tem cadastrados como sugestão.
 */

export type ItemCobranca = {
  competencia: number
  tipo: TipoContribuicao
  falta: "relacao" | "deposito"
  prazo: string
  valor: number
}

export type EmpresaACobrar = {
  empresaId: string
  nome: string
  itens: ItemCobranca[]
  contatos: { id: string; nome: string; email: string | null }[]
  /** Última cobrança ou contato registrado nas competências atrasadas. */
  ultimaCobranca: string | null
  /** Cobrada/contatada há menos de DIAS_SILENCIO_COBRANCA dias. */
  recente: boolean
  temLink: boolean
}

/** Contatos da folha de várias empresas de uma vez. */
export async function contatosDaFolhaDe(ids: string[]): Promise<Map<string, ContatoFolha[]>> {
  const mapa = new Map<string, ContatoFolha[]>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin
      .from("empresa_contatos")
      .select("id, empresa_id, nome, cargo, telefone, email, observacao")
      .eq("emp_proprietaria_id", emp)
      .eq("contato_folha", true)
      .in("empresa_id", ids.slice(i, i + 200))
      .order("nome")
    for (const c of (data ?? []) as (ContatoFolha & { empresa_id: string })[]) {
      const { empresa_id, ...resto } = c
      mapa.set(empresa_id, [...(mapa.get(empresa_id) ?? []), resto])
    }
  }
  return mapa
}

async function linksAtivos(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_repasse_links")
    .select("empresa_id, token")
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("revogado_em", null)
    .in("empresa_id", ids)
  const origem = await origemAtual()
  for (const l of data ?? []) mapa.set(l.empresa_id, `${origem}/relacao/${l.token}`)
  return mapa
}

/** As empresas com relação ou depósito atrasado (12 meses, tipos controlados). */
export async function empresasACobrar(): Promise<{ ativo: boolean; empresas: EmpresaACobrar[] }> {
  const regras = await regrasRepasse()
  if (!regras.disponivel || regras.desde === null) return { ativo: false, empresas: [] }
  const limite = new Date(Date.now() - DIAS_SILENCIO_COBRANCA * 86_400_000).toISOString().slice(0, 10)
  const porEmpresa = new Map<string, EmpresaACobrar>()
  for (const tipo of tiposControlados(regras)) {
    const q = await quadroRepasse({ tipo, meses: 12 })
    for (const l of q.linhas) {
      for (const c of l.celulas) {
        if (c.situacao !== "atrasada" && c.situacao !== "falta_deposito") continue
        const e =
          porEmpresa.get(l.id) ??
          ({ empresaId: l.id, nome: l.nome, itens: [], contatos: [], ultimaCobranca: null, recente: false, temLink: false } as EmpresaACobrar)
        e.itens.push({
          competencia: c.competencia,
          tipo,
          falta: c.situacao === "atrasada" ? "relacao" : "deposito",
          prazo: c.situacao === "atrasada" ? c.prazoEnvio : c.prazoDeposito,
          valor: c.valor,
        })
        if (c.ultimoEvento && (c.ultimoEvento.evento === "cobranca" || c.ultimoEvento.evento === "contato")) {
          if (!e.ultimaCobranca || c.ultimoEvento.data > e.ultimaCobranca) e.ultimaCobranca = c.ultimoEvento.data
        }
        porEmpresa.set(l.id, e)
      }
    }
  }
  const ids = [...porEmpresa.keys()]
  const [contatos, links] = await Promise.all([contatosDaFolhaDe(ids), linksAtivos(ids)])
  const empresas = [...porEmpresa.values()].map((e) => ({
    ...e,
    itens: e.itens.sort((a, b) => a.competencia - b.competencia || a.tipo.localeCompare(b.tipo)),
    contatos: (contatos.get(e.empresaId) ?? []).map((c) => ({ id: c.id, nome: c.nome, email: c.email })),
    recente: !!e.ultimaCobranca && e.ultimaCobranca >= limite,
    temLink: links.has(e.empresaId),
  }))
  empresas.sort((a, b) => Number(a.recente) - Number(b.recente) || b.itens.length - a.itens.length || a.nome.localeCompare(b.nome, "pt-BR"))
  return { ativo: true, empresas }
}

/** O e-mail de cobrança de uma empresa (uma ou várias competências). */
export function emailDeCobranca(dados: { empresa: string; itens: ItemCobranca[]; link: string | null; extra: string | null }) {
  const relacoes = dados.itens.filter((i) => i.falta === "relacao")
  const depositos = dados.itens.filter((i) => i.falta === "deposito")
  const linha = (i: ItemCobranca) =>
    `<li>Contribuição ${escaparHtml(i.tipo.toLowerCase())} de <strong>${rotuloCompetencia(i.competencia)}</strong> — prazo ${dataBr(i.prazo)}${i.falta === "deposito" && i.valor > 0 ? ` (relação de ${formatarMoeda(i.valor)})` : ""}</li>`
  const lista = (itens: ItemCobranca[]) => `<ul style="margin:8px 0 16px;padding-left:20px">${itens.map(linha).join("")}</ul>`
  const assunto =
    dados.itens.length === 1
      ? `${relacoes.length ? "Relação de descontos" : "Depósito"} de ${rotuloCompetencia(dados.itens[0].competencia)} — {ENTIDADE}`
      : `Relações e depósitos pendentes — {ENTIDADE}`
  const html =
    tituloEmail(dados.itens.length === 1 ? (relacoes.length ? "Relação de descontos pendente" : "Depósito pendente") : "Pendências de repasse") +
    paragrafo(`Prezados(as) da ${escaparHtml(dados.empresa)},`) +
    (relacoes.length
      ? paragrafo("Ainda não recebemos a relação dos descontos das contribuições destas competências:") +
        lista(relacoes) +
        paragrafo("A relação deve trazer nome, CPF ou matrícula e o valor descontado de cada trabalhador. Se não houve desconto em alguma delas, basta nos avisar.")
      : "") +
    (depositos.length
      ? paragrafo("Recebemos a relação, mas ainda não identificamos o depósito destas competências:") +
        lista(depositos) +
        paragrafo("Pedimos, por gentileza, que nos enviem o comprovante do depósito.")
      : "") +
    (dados.extra ? paragrafo(escaparHtml(dados.extra).replaceAll("\n", "<br>")) : "") +
    (dados.link
      ? paragrafo(`Vocês podem enviar as relações pela página da empresa: <a href="${dados.link}">${escaparHtml(dados.link)}</a>. Ou respondam a este e-mail.`)
      : paragrafo("Basta responder a este e-mail.")) +
    paragrafo("Obrigado(a).")
  return { assunto, html }
}

export type ResultadoLote = { empresa: string; enviados: string[]; erro?: string }

/** Cobra as empresas escolhidas: um e-mail por empresa e um registro por competência. */
export async function cobrarEmLote(
  empresaIds: string[],
  extra: string | null,
  usuario: { id: string; nome: string | null }
): Promise<ResultadoLote[]> {
  const { empresas } = await empresasACobrar()
  const escolhidas = empresas.filter((e) => empresaIds.includes(e.empresaId))
  const links = await linksAtivos(escolhidas.map((e) => e.empresaId))
  const resultados: ResultadoLote[] = []
  const hoje = hojeSP()
  for (const e of escolhidas) {
    const destinos = e.contatos.filter((c) => c.email)
    if (destinos.length === 0) {
      resultados.push({ empresa: e.nome, enviados: [], erro: "sem contato da folha com e-mail" })
      continue
    }
    const { assunto, html } = emailDeCobranca({ empresa: e.nome, itens: e.itens, link: links.get(e.empresaId) ?? null, extra })
    const enviados: string[] = []
    for (const c of destinos) {
      if (await enviarEmail({ processo: "filiados.repasse_cobranca", email: c.email!, nome: c.nome, assunto, html }).catch(() => false)) enviados.push(c.email!)
    }
    if (enviados.length === 0) {
      resultados.push({ empresa: e.nome, enviados, erro: "o e-mail não saiu" })
      continue
    }
    for (const i of e.itens) {
      await registrarEventoRepasse({
        empresaId: e.empresaId,
        competencia: i.competencia,
        tipo: i.tipo,
        evento: "cobranca",
        meio: "email",
        data: hoje,
        observacao: `Cobrança em lote (${i.falta === "deposito" ? "depósito" : "relação"}) enviada para ${enviados.join(", ")}.${extra ? ` ${extra}` : ""}`,
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
      })
    }
    resultados.push({ empresa: e.nome, enviados })
  }
  invalidarAvisosRepasse()
  return resultados
}

// ── Contatos da folha: quem não tem e sugestões ─────────────────────────────

export type EmpresaSemContato = {
  empresaId: string
  nome: string
  filiadosAtivos: number
  grupo: string | null
  /** Contato da folha cadastrado, mas sem e-mail (só telefone). */
  semEmail: boolean
  sugestoes: { id: string; nome: string; cargo: string | null; email: string | null; telefone: string | null; daEmpresa: string }[]
}

/** Empresas que mandam relação e não têm contato da folha com e-mail. */
export async function empresasSemContatoDaFolha(): Promise<{ total: number; empresas: EmpresaSemContato[] }> {
  const { unidades } = await unidadesDeRepasse()
  const relevantes = unidades.filter((u) => u.filiadosAtivos > 0)
  const contatos = await contatosDaFolhaDe(relevantes.map((u) => u.id))
  const faltam = relevantes.filter((u) => !(contatos.get(u.id) ?? []).some((c) => c.email))
  // Sugestões: contatos já cadastrados da própria empresa (e das empresas do grupo).
  const ids = [...new Set(faltam.flatMap((u) => u.fontes))]
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const outros: { id: string; empresa_id: string; nome: string; cargo: string | null; email: string | null; telefone: string | null; contato_folha: boolean }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin
      .from("empresa_contatos")
      .select("id, empresa_id, nome, cargo, email, telefone, contato_folha")
      .eq("emp_proprietaria_id", emp)
      .in("empresa_id", ids.slice(i, i + 200))
      .order("nome")
    outros.push(...((data ?? []) as typeof outros))
  }
  const nomes = new Map(unidades.flatMap((u) => u.fontes.map((f) => [f, u.nome] as const)))
  const empresas = faltam
    .map((u) => ({
      empresaId: u.id,
      nome: u.nome,
      filiadosAtivos: u.filiadosAtivos,
      grupo: u.grupo?.nome ?? null,
      semEmail: (contatos.get(u.id) ?? []).length > 0,
      sugestoes: outros
        .filter((c) => u.fontes.includes(c.empresa_id) && !(c.contato_folha && c.empresa_id === u.id))
        // RH, folha, pessoal e departamento de pessoal primeiro.
        .sort((a, b) => Number(/rh|folha|pessoal|recursos humanos/i.test(b.cargo ?? "")) - Number(/rh|folha|pessoal|recursos humanos/i.test(a.cargo ?? "")))
        .map((c) => ({ id: c.id, nome: c.nome, cargo: c.cargo, email: c.email, telefone: c.telefone, daEmpresa: c.empresa_id === u.id ? u.nome : (nomes.get(c.empresa_id) ?? "outra empresa do grupo") })),
    }))
    .sort((a, b) => b.filiadosAtivos - a.filiadosAtivos)
  return { total: relevantes.length, empresas }
}

/** Marca um contato já cadastrado como contato da folha (copiando-o, se for de outra empresa do grupo). */
export async function usarComoContatoDaFolha(empresaId: string, contatoId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: c } = await admin
    .from("empresa_contatos")
    .select("id, empresa_id, nome, cargo, telefone, email, observacao")
    .eq("id", contatoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!c) return { erro: "Contato não encontrado." }
  if (!c.email && !c.telefone) return { erro: "Esse contato não tem e-mail nem telefone." }
  const { error } =
    c.empresa_id === empresaId
      ? await admin.from("empresa_contatos").update({ contato_folha: true, updated_at: new Date().toISOString() }).eq("id", c.id)
      : await admin.from("empresa_contatos").insert({
          emp_proprietaria_id: emp,
          empresa_id: empresaId,
          nome: c.nome,
          cargo: c.cargo,
          telefone: c.telefone,
          email: c.email,
          observacao: c.observacao,
          contato_folha: true,
        })
  if (error) return { erro: `Não foi possível marcar o contato: ${error.message}` }
  return {}
}
