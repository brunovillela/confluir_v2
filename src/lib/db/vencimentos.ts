import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { avisar, type Destinatario } from "@/lib/db/avisos"
import { hojeSP, texto } from "@/lib/db/comum"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { somarDias } from "@/lib/db/ferias"
import { FILTRO_NAO_PAGA_NO_ATO, SITUACOES_ABERTAS } from "@/lib/db/financeiro"
import { escaparHtml, paragrafo, textoSuave } from "@/lib/email-layout"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { PERMISSOES_USUARIO_FK, podeAcessar, type Permissoes } from "@/lib/permissoes"
import { resolverPermissoes } from "@/lib/permissoes-resolver"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * RESUMO DIÁRIO DE VENCIMENTOS (onda 2, A6/D4): o que hoje só aparece "na
 * tela" de cada módulo passa a procurar quem cuida — contratos e ajudas
 * institucionais, acordos coletivos (vigência do empregador), CNH, seguro e
 * locação dos veículos, ASO, férias com concessivo vencendo, treinamentos,
 * faturas de viagem, ordens vencidas, mandatos da diretoria e assentos nas
 * instâncias, convênios e reuniões da CIPA.
 *
 * Cada fonte usa a MESMA janela que a sua tela (30/90/120 dias) e a mesma
 * permissão. Roda fora de requisição (cron /api/vencimentos/tick): service
 * role, tenant por tenant; um resumo por pessoa por dia, só quando há algo.
 */

export type ItemVencimento = {
  rotulo: string
  /** Data do vencimento (ISO). */
  data: string
  /** Dias até o vencimento; negativo = vencido. */
  dias: number
  href: string
}

export type GrupoVencimento = {
  chave: string
  titulo: string
  permissao: { chave: string; alternativas: string[] }
  itens: ItemVencimento[]
}

type Fonte = { tenantId: string; svc: SupabaseClient; hoje: string }

function diasEntre(hoje: string, data: string): number {
  const a = Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10))
  const b = Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

function item(rotulo: string, data: unknown, href: string, hoje: string): ItemVencimento | null {
  const iso = texto(data)?.slice(0, 10)
  if (!iso) return null
  return { rotulo, data: iso, dias: diasEntre(hoje, iso), href }
}

async function nomesDe(svc: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return new Map()
  const { data } = await svc.from("usuarios").select("id, nome_completo, nome_guerra").in("id", unicos)
  return new Map((data ?? []).map((u) => [String(u.id), texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "(sem nome)"]))
}

async function nomesEmpresa(svc: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return new Map()
  const { data } = await svc.from("empresa").select("id, nome_fantasia, nome_razao").in("id", unicos)
  return new Map((data ?? []).map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "(sem nome)"]))
}

// ── Fontes ───────────────────────────────────────────────────────────────────

async function contratos(f: Fonte, apoio: boolean): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("contratos")
    .select("id, codigo, objeto, vigencia_termino, fornecedor_id")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("deletado", "is", true)
    .eq("apoio_institucional", apoio)
    .not("vigencia_termino", "is", null)
    .lte("vigencia_termino", somarDias(f.hoje, 30))
    .order("vigencia_termino")
    .limit(50)
  const nomes = await nomesEmpresa(f.svc, (data ?? []).map((c) => texto(c.fornecedor_id) ?? ""))
  const base = apoio ? "/painel/institucional/ajudas" : "/painel/compras/contratos"
  return (data ?? [])
    .map((c) => item(`${texto(c.codigo) ?? ""} ${nomes.get(String(c.fornecedor_id)) ?? ""} — ${(texto(c.objeto) ?? "").slice(0, 70)}`.trim(), c.vigencia_termino, apoio ? base : `${base}/${c.id}`, f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function acordos(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("acordo_coletivo")
    .select("id, titulo, tipo, vigencia_fim")
    .eq("emp_proprietaria_id", f.tenantId)
    .eq("situacao", "vigente")
    .is("negociacao_id", null)
    .not("vigencia_fim", "is", null)
    .lte("vigencia_fim", somarDias(f.hoje, 90))
    .order("vigencia_fim")
    .limit(50)
  return (data ?? [])
    .map((a) => item(`${String(a.tipo ?? "").toUpperCase()} ${texto(a.titulo) ?? ""}`.trim(), a.vigencia_fim, `/painel/representacao/acordos/${a.id}`, f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function cnh(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("veiculos_condutores")
    .select("id, usuario_id, cnh_validade")
    .eq("emp_proprietaria_id", f.tenantId)
    .eq("autorizado", true)
    .not("cnh_validade", "is", null)
    .lte("cnh_validade", somarDias(f.hoje, 30))
    .order("cnh_validade")
    .limit(50)
  const nomes = await nomesDe(f.svc, (data ?? []).map((c) => String(c.usuario_id)))
  return (data ?? [])
    .map((c) => item(`CNH de ${nomes.get(String(c.usuario_id)) ?? "condutor"}`, c.cnh_validade, "/painel/veiculos/condutores", f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function seguros(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("veiculos")
    .select("id, placa, marca_modelo, seguro_vencimento")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("inativo", "is", true)
    .not("seguro_vencimento", "is", null)
    .lte("seguro_vencimento", somarDias(f.hoje, 30))
    .order("seguro_vencimento")
    .limit(50)
  return (data ?? [])
    .map((v) => item(`Seguro de ${texto(v.placa) ?? ""} ${texto(v.marca_modelo) ?? ""}`.trim(), v.seguro_vencimento, `/painel/veiculos/${v.id}`, f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function locacoes(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("veiculo_contratos_aluguel")
    .select("id, numero_contrato_locadora, fornecedor_id, vigencia_termino")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("finalizado", "is", true)
    .not("vigencia_termino", "is", null)
    .lte("vigencia_termino", somarDias(f.hoje, 30))
    .order("vigencia_termino")
    .limit(50)
  const nomes = await nomesEmpresa(f.svc, (data ?? []).map((c) => texto(c.fornecedor_id) ?? ""))
  return (data ?? [])
    .map((c) => item(`Locação ${texto(c.numero_contrato_locadora) ?? ""} — ${nomes.get(String(c.fornecedor_id)) ?? "locadora"}`.trim(), c.vigencia_termino, `/painel/veiculos/contratos/${c.id}`, f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function usuariosAtivos(f: Fonte): Promise<Map<string, string>> {
  const { data } = await f.svc
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("inativo", "is", true)
    .not("deletado", "is", true)
  return new Map((data ?? []).map((u) => [String(u.id), texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "(sem nome)"]))
}

async function asos(f: Fonte, pessoas: Map<string, string>): Promise<ItemVencimento[]> {
  if (pessoas.size === 0) return []
  // `aso` não tem tenant: o recorte vem das pessoas do tenant.
  const { data } = await f.svc
    .from("aso")
    .select("id, funcionario_id, vencimento, tipo")
    .in("funcionario_id", [...pessoas.keys()])
    .eq("ultimo", true)
    .not("vencimento", "is", null)
    .lte("vencimento", somarDias(f.hoje, 90))
    .order("vencimento")
    .limit(100)
  return (data ?? [])
    .map((a) => item(`ASO de ${pessoas.get(String(a.funcionario_id)) ?? "funcionário"}`, a.vencimento, "/painel/pessoal/aso", f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function ferias(f: Fonte, pessoas: Map<string, string>): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("pessoal_ferias")
    .select("id, trabalhador_id, concessivo_termino")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("finalizado", "is", true)
    .not("concessivo_termino", "is", null)
    .lte("concessivo_termino", somarDias(f.hoje, 120))
    .order("concessivo_termino")
    .limit(100)
  return (data ?? [])
    .filter((p) => pessoas.has(String(p.trabalhador_id)))
    .map((p) => item(`Férias de ${pessoas.get(String(p.trabalhador_id))} (fim do período concessivo)`, p.concessivo_termino, "/painel/pessoal/ferias", f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function treinamentos(f: Fonte, pessoas: Map<string, string>): Promise<ItemVencimento[]> {
  const [{ data: cursos }, { data: alunos }] = await Promise.all([
    f.svc.from("pessoal_treinamentos").select("id, treinamento, vencimento_meses").eq("emp_proprietaria_id", f.tenantId).not("vencimento_meses", "is", null),
    f.svc.from("pessoal_treinamentos_alunos").select("id, aluno_id, treinamento_id, data_termino").eq("emp_proprietaria_id", f.tenantId).not("data_termino", "is", null),
  ])
  const porCurso = new Map((cursos ?? []).map((c) => [String(c.id), c]))
  const limite = somarDias(f.hoje, 30)
  // Só a matrícula mais recente de cada pessoa no curso conta.
  const maisRecente = new Map<string, { aluno: string; curso: string; validoAte: string }>()
  for (const a of alunos ?? []) {
    const curso = porCurso.get(String(a.treinamento_id))
    if (!curso || !pessoas.has(String(a.aluno_id))) continue
    const termino = String(a.data_termino).slice(0, 10)
    const d = new Date(`${termino}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + Number(curso.vencimento_meses))
    const validoAte = d.toISOString().slice(0, 10)
    const chave = `${a.aluno_id}:${a.treinamento_id}`
    const atual = maisRecente.get(chave)
    if (!atual || atual.validoAte < validoAte) maisRecente.set(chave, { aluno: String(a.aluno_id), curso: String(curso.treinamento ?? "treinamento"), validoAte })
  }
  return [...maisRecente.values()]
    .filter((m) => m.validoAte <= limite)
    .sort((a, b) => a.validoAte.localeCompare(b.validoAte))
    .slice(0, 50)
    .map((m) => item(`${m.curso} — ${pessoas.get(m.aluno)}`, m.validoAte, "/painel/pessoal/treinamentos", f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function faturasViagem(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("viagens_faturas")
    .select("id, numero, fornecedor_id, vencimento, valor_total, ordem_pagamento_id")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("vencimento", "is", null)
    .lte("vencimento", somarDias(f.hoje, 7))
    .order("vencimento")
    .limit(50)
  const ordens = (data ?? []).map((x) => texto(x.ordem_pagamento_id)).filter((v): v is string => Boolean(v))
  const pagas = new Set<string>()
  if (ordens.length) {
    const { data: o } = await f.svc.from("ordens_pagamento").select("id, situacao").in("id", ordens)
    for (const x of o ?? []) if (["Paga", "Cancelada", "Estornado"].includes(String(x.situacao))) pagas.add(String(x.id))
  }
  const nomes = await nomesEmpresa(f.svc, (data ?? []).map((x) => texto(x.fornecedor_id) ?? ""))
  return (data ?? [])
    .filter((x) => !x.ordem_pagamento_id || !pagas.has(String(x.ordem_pagamento_id)))
    .map((x) => item(`Fatura ${texto(x.numero) ?? ""} — ${nomes.get(String(x.fornecedor_id)) ?? "agência"} (${formatarMoeda(Number(x.valor_total ?? 0))})`, x.vencimento, `/painel/institucional/viagens/faturas/${x.id}`, f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function ordensVencidas(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("ordens_pagamento")
    .select("id, codigo, descricao, valor_inicial_cobranca, vencimento")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("excluido", "is", true)
    .in("situacao", [...SITUACOES_ABERTAS])
    .or(FILTRO_NAO_PAGA_NO_ATO)
    .not("vencimento", "is", null)
    .lte("vencimento", somarDias(f.hoje, 3))
    .order("vencimento")
    .limit(50)
  return (data ?? [])
    .map((o) => item(`${texto(o.codigo) ?? "Ordem"} — ${(texto(o.descricao) ?? "").slice(0, 60)} (${formatarMoeda(Number(o.valor_inicial_cobranca ?? 0))})`, o.vencimento, `/painel/financeiro/ordens/${o.id}`, f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function mandatos(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("diretoria_mandatos")
    .select("id, mandato, data_termino")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("data_termino", "is", null)
    .gte("data_termino", f.hoje)
    .lte("data_termino", somarDias(f.hoje, 90))
    .order("data_termino")
    .limit(10)
  return (data ?? [])
    .map((m) => item(`Mandato ${texto(m.mandato) ?? ""} da diretoria`.trim(), m.data_termino, `/painel/institucional/diretoria/${m.id}`, f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function assentos(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("diretoria_instancia_assentos")
    .select("id, instancia_id, integrante_id, cargo, mandato_fim")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("mandato_fim", "is", null)
    .gte("mandato_fim", f.hoje)
    .lte("mandato_fim", somarDias(f.hoje, 90))
    .order("mandato_fim")
    .limit(50)
  if (!data?.length) return []
  const [{ data: inst }, { data: integ }] = await Promise.all([
    f.svc.from("diretoria_instancias").select("id, nome").in("id", data.map((a) => String(a.instancia_id))),
    f.svc.from("diretoria_integrantes").select("id, nome, situacao").in("id", data.map((a) => String(a.integrante_id))),
  ])
  const nomeInst = new Map((inst ?? []).map((i) => [String(i.id), texto(i.nome) ?? "instância"]))
  const integrantes = new Map((integ ?? []).map((i) => [String(i.id), i]))
  return data
    .filter((a) => integrantes.get(String(a.integrante_id))?.situacao !== "excluido")
    .map((a) => item(`${texto(integrantes.get(String(a.integrante_id))?.nome) ?? "integrante"} — ${texto(a.cargo) ?? "assento"} em ${nomeInst.get(String(a.instancia_id))}`, a.mandato_fim, `/painel/institucional/diretoria/instancias/${a.instancia_id}`, f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function convenios(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("filiacao_convenios")
    .select("id, conveniador_id, data_termino")
    .eq("emp_proprietaria_id", f.tenantId)
    .eq("ativo", true)
    .not("data_termino", "is", null)
    .lte("data_termino", somarDias(f.hoje, 30))
    .order("data_termino")
    .limit(50)
  const nomes = await nomesEmpresa(f.svc, (data ?? []).map((c) => texto(c.conveniador_id) ?? ""))
  return (data ?? [])
    .map((c) => item(`Convênio com ${nomes.get(String(c.conveniador_id)) ?? "conveniador"}`, c.data_termino, `/painel/filiados/convenios/${c.id}`, f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function cipa(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("saude_cipa_agenda")
    .select("id, data_reuniao, empresa_id, unidade")
    .eq("emp_proprietaria_id", f.tenantId)
    .eq("situacao", "convidado")
    .not("data_reuniao", "is", null)
    .gte("data_reuniao", f.hoje)
    .lte("data_reuniao", somarDias(f.hoje, 7))
    .order("data_reuniao")
    .limit(20)
  const nomes = await nomesEmpresa(f.svc, (data ?? []).map((r) => texto(r.empresa_id) ?? ""))
  return (data ?? [])
    .map((r) => item(`Reunião da CIPA — ${nomes.get(String(r.empresa_id)) ?? "empresa"}${texto(r.unidade) ? ` (${texto(r.unidade)})` : ""}`, r.data_reuniao, `/painel/saude/cipa/${r.id}`, f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

// ── Reunião ──────────────────────────────────────────────────────────────────

export async function vencimentosDoTenant(tenantId: string): Promise<GrupoVencimento[]> {
  const f: Fonte = { tenantId, svc: createServiceClient(), hoje: hojeSP() }
  const pessoas = await usuariosAtivos(f)
  const seguro = async (fn: () => Promise<ItemVencimento[]>) => {
    try {
      return await fn()
    } catch (e) {
      console.error("vencimentos:", e)
      return []
    }
  }
  const grupos: GrupoVencimento[] = [
    { chave: "contratos", titulo: "Contratos", permissao: { chave: "aquisicoes_contratos", alternativas: ["aquisicoes_contratos_edicao"] }, itens: await seguro(() => contratos(f, false)) },
    { chave: "ajudas", titulo: "Ajudas institucionais", permissao: { chave: "apoio_institucional", alternativas: ["apoio_institucional_edicao"] }, itens: await seguro(() => contratos(f, true)) },
    { chave: "acordos", titulo: "Acordos coletivos (vigência)", permissao: { chave: "acordos_coletivos", alternativas: [] }, itens: await seguro(() => acordos(f)) },
    { chave: "cnh", titulo: "CNH dos condutores", permissao: { chave: "veiculos_gestao", alternativas: [] }, itens: await seguro(() => cnh(f)) },
    { chave: "seguros", titulo: "Seguro dos veículos", permissao: { chave: "veiculos_gestao", alternativas: [] }, itens: await seguro(() => seguros(f)) },
    { chave: "locacoes", titulo: "Locação de veículos", permissao: { chave: "veiculos_gestao", alternativas: [] }, itens: await seguro(() => locacoes(f)) },
    { chave: "asos", titulo: "ASO", permissao: { chave: "pessoal_gestao", alternativas: ["pessoal_aso"] }, itens: await seguro(() => asos(f, pessoas)) },
    { chave: "ferias", titulo: "Férias (período concessivo)", permissao: { chave: "pessoal_gestao", alternativas: [] }, itens: await seguro(() => ferias(f, pessoas)) },
    { chave: "treinamentos", titulo: "Treinamentos", permissao: { chave: "pessoal_gestao", alternativas: [] }, itens: await seguro(() => treinamentos(f, pessoas)) },
    { chave: "faturas", titulo: "Faturas de viagem", permissao: { chave: "viagens_gestao", alternativas: [] }, itens: await seguro(() => faturasViagem(f)) },
    { chave: "ordens", titulo: "Ordens de pagamento", permissao: { chave: "financeiro_pagamento", alternativas: ["financeiro_leitura"] }, itens: await seguro(() => ordensVencidas(f)) },
    { chave: "mandatos", titulo: "Mandato da diretoria", permissao: { chave: "diretoria_mandatos", alternativas: ["configuracoes"] }, itens: await seguro(() => mandatos(f)) },
    { chave: "assentos", titulo: "Assentos nas instâncias", permissao: { chave: "diretoria_mandatos", alternativas: ["configuracoes"] }, itens: await seguro(() => assentos(f)) },
    { chave: "convenios", titulo: "Convênios", permissao: { chave: "filiacao_convenios", alternativas: ["filiacao_gestao"] }, itens: await seguro(() => convenios(f)) },
    { chave: "cipa", titulo: "Reuniões da CIPA", permissao: { chave: "saude_cat", alternativas: ["saude_atendimento", "saude_gestao"] }, itens: await seguro(() => cipa(f)) },
  ]
  return grupos.filter((g) => g.itens.length > 0)
}

export function gruposDaPessoa(grupos: GrupoVencimento[], permissoes: Permissoes): GrupoVencimento[] {
  return grupos.filter((g) => podeAcessar(permissoes, g.permissao.chave, g.permissao.alternativas))
}

function quando(i: ItemVencimento): string {
  if (i.dias < 0) return `vencido há ${-i.dias} dia${i.dias === -1 ? "" : "s"}`
  if (i.dias === 0) return "vence hoje"
  return `vence em ${i.dias} dia${i.dias === 1 ? "" : "s"} (${formatarData(i.data)})`
}

export function textoResumo(grupos: GrupoVencimento[]): string {
  const total = grupos.reduce((s, g) => s + g.itens.length, 0)
  const vencidos = grupos.reduce((s, g) => s + g.itens.filter((i) => i.dias < 0).length, 0)
  const partes = grupos.map((g) => {
    const v = g.itens.filter((i) => i.dias < 0).length
    return `${g.titulo}: ${g.itens.length}${v ? ` (${v} vencido${v === 1 ? "" : "s"})` : ""}`
  })
  return `Resumo de vencimentos: ${total} ${total === 1 ? "item" : "itens"}${vencidos ? `, ${vencidos} já vencido${vencidos === 1 ? "" : "s"}` : ""}. ${partes.join("; ")}.`
}

const MAX_POR_GRUPO = 8

export function htmlResumo(grupos: GrupoVencimento[], origem: string): string {
  const blocos = grupos
    .map((g) => {
      const itens = g.itens
        .slice(0, MAX_POR_GRUPO)
        .map((i) => `<li style="margin:0 0 6px;${i.dias < 0 ? "color:#b91c1c;" : ""}"><a href="${origem}${i.href}" style="color:inherit;">${escaparHtml(i.rotulo)}</a> — ${quando(i)}</li>`)
        .join("")
      const mais = g.itens.length > MAX_POR_GRUPO ? `<li style="margin:0 0 6px;color:#6b7280;">e mais ${g.itens.length - MAX_POR_GRUPO}…</li>` : ""
      return `<p style="margin:16px 0 6px;font-weight:600;">${escaparHtml(g.titulo)}</p><ul style="margin:0;padding-left:20px;">${itens}${mais}</ul>`
    })
    .join("")
  return (
    paragrafo("O que está vencendo ou já venceu nas áreas que você cuida:") +
    blocos +
    textoSuave("Este resumo sai uma vez por dia enquanto houver vencimento na janela de cada área. Para desligá-lo, abra Meu perfil → Avisos.")
  )
}

export async function tenantsDoResumo(): Promise<string[]> {
  const svc = createServiceClient()
  const { data, error } = await svc.from("tenants").select("empresa_id")
  if (error) return []
  return (data ?? []).map((t) => texto(t.empresa_id)).filter((v): v is string => Boolean(v))
}

export async function enviarResumoVencimentos(tenantId: string): Promise<{ grupos: number; pessoas: number; resumos: number }> {
  const svc = createServiceClient()
  const grupos = await vencimentosDoTenant(tenantId)
  if (grupos.length === 0) return { grupos: 0, pessoas: 0, resumos: 0 }
  const contexto = await contextoDoTenant(tenantId, svc)

  const { data: acessos } = await svc
    .from("permissoes")
    .select("*")
    .eq("emp_proprietaria_id", tenantId)
    .not(PERMISSOES_USUARIO_FK, "is", null)
  const porUsuario = new Map<string, Permissoes>()
  for (const a of acessos ?? []) porUsuario.set(String(a[PERMISSOES_USUARIO_FK]), a as Permissoes)
  if (porUsuario.size === 0) return { grupos: grupos.length, pessoas: 0, resumos: 0 }

  const { data: usuarios } = await svc
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .in("id", [...porUsuario.keys()])
    .eq("emp_proprietaria_id", tenantId)
    .not("inativo", "is", true)
    .not("deletado", "is", true)

  let resumos = 0
  for (const u of usuarios ?? []) {
    const id = String(u.id)
    const base = porUsuario.get(id)
    if (!base) continue
    const permissoes = await resolverPermissoes(svc, id, base)
    const meus = gruposDaPessoa(grupos, permissoes)
    if (meus.length === 0) continue
    const d: Destinatario = { id, nome: texto(u.nome_completo) ?? texto(u.nome_guerra), email: texto(u.email), permissoes }
    resumos += await avisar(
      [d],
      {
        texto: textoResumo(meus),
        link: "/painel",
        evento: "resumo_vencimentos",
        assunto: `Vencimentos de hoje — ${contexto.entidade}`,
        html: htmlResumo(meus, contexto.origem),
        umaVezPorDia: true,
        prefixoDoDia: "Resumo de vencimentos:",
      },
      { client: svc, tenantId, contexto }
    )
  }
  return { grupos: grupos.length, pessoas: (usuarios ?? []).length, resumos }
}
