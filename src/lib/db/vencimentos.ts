import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { avisar, type Destinatario } from "@/lib/db/avisos"
import { hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { somarDias } from "@/lib/db/ferias"
import { FILTRO_NAO_PAGA_NO_ATO, SITUACOES_ABERTAS } from "@/lib/db/financeiro"
import { escaparHtml, paragrafo, textoSuave } from "@/lib/email-layout"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { resumoLocacao } from "@/lib/locacao-periodo"
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
  /**
   * Alerta que não é um prazo (cobrança que não chegou, apontamento aberto):
   * o texto substitui o "vence em…" e diz se conta como atrasado.
   */
  nota?: string
  atrasado?: boolean
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

/**
 * Os alertas da tela de Veículos (alertasLocacao, alertasApontamentos), para
 * quem não abre o painel: cobrança que não chegou, cobrança sem a fatura,
 * contrato sem uso definido, apontamento de checklist aberto. Mesmas regras;
 * aqui pelo service role, porque o resumo roda fora de requisição.
 */
async function cobrancasLocacao(f: Fonte): Promise<ItemVencimento[]> {
  const { data: contratos } = await f.svc
    .from("veiculo_contratos_aluguel")
    .select("id, numero_contrato_locadora, fornecedor_id, vigencia_inicio, vigencia_termino, valor_mensal, uso")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("finalizado", "is", true)
    .limit(200)
  if (!contratos?.length) return []
  const ids = contratos.map((c) => String(c.id))
  const [nomes, ordens, { data: carros }] = await Promise.all([
    nomesEmpresa(f.svc, contratos.map((c) => texto(c.fornecedor_id) ?? "")),
    lerEmLotes<Record<string, unknown>>((de, ate) =>
      f.svc
        .from("ordens_pagamento")
        .select("id, contrato_aluguel_id, descricao, situacao, valor_inicial_cobranca, data_pagamento, vencimento, arquivo_nota_fiscal, categoria_locacao")
        .eq("emp_proprietaria_id", f.tenantId)
        .in("contrato_aluguel_id", ids)
        .not("excluido", "is", true)
        .order("id")
        .range(de, ate)
    ),
    f.svc.from("veiculos").select("contrato_aluguel_id").eq("emp_proprietaria_id", f.tenantId).in("contrato_aluguel_id", ids),
  ])
  const comCarro = new Set((carros ?? []).map((v) => String(v.contrato_aluguel_id)))
  const itens: ItemVencimento[] = []
  for (const c of contratos) {
    const nome = `Locação ${texto(c.numero_contrato_locadora) ?? ""} — ${nomes.get(String(c.fornecedor_id)) ?? "locadora"}`
    const href = `/painel/veiculos/contratos/${c.id}`
    const lista = ordens.filter((o) => String(o.contrato_aluguel_id) === String(c.id))
    if (!c.uso) {
      const temCarro = comCarro.has(String(c.id))
      itens.push({
        rotulo: nome,
        data: f.hoje,
        dias: 0,
        href: `${href}?uso=1`,
        nota: `uso não definido (dedicado ou coletivo)${temCarro ? " — o carro segue oferecido na recepção" : ""}`,
        atrasado: temCarro,
      })
    }
    const resumo = resumoLocacao(
      {
        vigencia_inicio: texto(c.vigencia_inicio),
        vigencia_termino: texto(c.vigencia_termino),
        valor_mensal: Number(c.valor_mensal) || null,
      },
      lista.map((o) => ({
        descricao: texto(o.descricao),
        situacao: texto(o.situacao),
        valor: Number(o.valor_inicial_cobranca) || 0,
        data_pagamento: texto(o.data_pagamento),
        categoria: texto(o.categoria_locacao),
      })),
      f.hoje
    )
    for (const t of resumo.semCobranca.filter((t) => t.atrasado)) {
      itens.push({
        rotulo: nome,
        data: t.ate,
        dias: diasEntre(f.hoje, t.ate),
        href,
        nota: `${formatarData(t.de)} a ${formatarData(t.ate)} sem cobrança (${t.dias} dia${t.dias === 1 ? "" : "s"}) — a fatura chegou?`,
        atrasado: true,
      })
    }
    const semFatura = lista.filter(
      (o) => !["Cancelada", "Estornado", "Paga"].includes(String(o.situacao ?? "")) && !o.data_pagamento && !texto(o.arquivo_nota_fiscal)
    )
    if (semFatura.length) {
      const primeiro =
        semFatura
          .map((o) => texto(o.vencimento)?.slice(0, 10))
          .filter((v): v is string => Boolean(v))
          .sort()[0] ?? f.hoje
      const dias = diasEntre(f.hoje, primeiro)
      const n = semFatura.length
      itens.push({
        rotulo: nome,
        data: primeiro,
        dias,
        href,
        nota: `${n} cobrança${n === 1 ? "" : "s"} sem fatura anexada (${n === 1 ? "" : "a primeira "}${dias < 0 ? "venceu" : "vence"} em ${formatarData(primeiro)})`,
        atrasado: dias < 0,
      })
    }
  }
  return itens
}

async function apontamentosChecklist(f: Fonte): Promise<ItemVencimento[]> {
  const { data, error } = await f.svc
    .from("veiculos_checklist_apontamentos")
    .select("veiculo_id, categoria, aberto_em, manutencao_id")
    .eq("emp_proprietaria_id", f.tenantId)
    .eq("situacao", "aberto")
    .order("aberto_em")
    .limit(500)
  if (error || !data?.length) return []
  const veiculoIds = [...new Set(data.map((a) => String(a.veiculo_id)))]
  const { data: carros } = await f.svc.from("veiculos").select("id, codigo, placa, marca_modelo").in("id", veiculoIds)
  const rotulo = new Map(
    (carros ?? []).map((v) => [String(v.id), [texto(v.placa), texto(v.marca_modelo)].filter(Boolean).join(" · ") || (texto(v.codigo) ?? "Veículo")])
  )
  type Linha = (typeof data)[number]
  // A consulta vem do mais antigo: o primeiro da lista dá o "desde".
  const desde = (l: Linha[]) => (texto(l[0].aberto_em) ?? f.hoje).slice(0, 10)
  const qual = (l: Linha[]) => (l.length === 1 ? `"${texto(l[0].categoria) ?? "item"}"` : `${l.length} apontamentos`)
  const itens: ItemVencimento[] = []
  for (const veiculoId of veiculoIds) {
    const doVeiculo = data.filter((a) => String(a.veiculo_id) === veiculoId)
    const href = `/painel/veiculos/${veiculoId}#apontamentos`
    const nome = rotulo.get(veiculoId) ?? "Veículo"
    const semManutencao = doVeiculo.filter((a) => !a.manutencao_id)
    if (semManutencao.length) {
      const dias = diasEntre(f.hoje, desde(semManutencao))
      itens.push({
        rotulo: nome,
        data: desde(semManutencao),
        dias,
        href,
        nota: `${qual(semManutencao)} do checklist pede${semManutencao.length === 1 ? "" : "m"} manutenção corretiva (${dias === 0 ? "aberto hoje" : `aberto há ${-dias} dia${dias === -1 ? "" : "s"}`})`,
        atrasado: true,
      })
    }
    const comManutencao = doVeiculo.filter((a) => a.manutencao_id)
    if (comManutencao.length) {
      itens.push({
        rotulo: nome,
        data: desde(comManutencao),
        dias: diasEntre(f.hoje, desde(comManutencao)),
        href,
        nota: `manutenção feita em ${qual(comManutencao)} — falta o checklist confirmar que foi sanado`,
        atrasado: false,
      })
    }
  }
  return itens
}

/**
 * Nome dos usuários ATIVOS do tenant entre os ids dados — o recorte de ASO,
 * férias e treinamentos. Só os ids que essas fontes trazem: ler todos os
 * ativos (12 mil, filiados inclusos) parava em 1.000 no PostgREST e, em
 * lotes, custava 13 idas ao banco a cada resumo. Fatias de 200 no .in(); erro
 * numa fatia deixa aqueles ids de fora (antes, erro → mapa vazio).
 */
async function pessoasAtivas(f: Fonte, ids: unknown[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.map((v) => texto(v)).filter((v): v is string => v !== null))]
  const pessoas = new Map<string, string>()
  for (let i = 0; i < unicos.length; i += 200) {
    const { data } = await f.svc
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", unicos.slice(i, i + 200))
      .eq("emp_proprietaria_id", f.tenantId)
      .not("inativo", "is", true)
      .not("deletado", "is", true)
    for (const u of data ?? []) pessoas.set(String(u.id), texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "(sem nome)")
  }
  return pessoas
}

async function asos(f: Fonte): Promise<ItemVencimento[]> {
  // `aso` não tem tenant: o recorte vem do funcionário, usuário do tenant —
  // filtrado no banco pelo embed (FK funcionario_id), em vez de mandar os ids
  // de todas as pessoas num .in() (12 mil: teto de 1.000 e URL estourada).
  // Depois, só os ativos; a ordem e o teto de 100 são reaplicados aqui.
  const linhas = await lerEmLotes<{ funcionario_id: unknown; vencimento: unknown }>((de, ate) =>
    f.svc
      .from("aso")
      .select("id, funcionario_id, vencimento, usuarios!funcionario_id!inner(emp_proprietaria_id)")
      .eq("usuarios.emp_proprietaria_id", f.tenantId)
      .eq("ultimo", true)
      .not("vencimento", "is", null)
      .lte("vencimento", somarDias(f.hoje, 90))
      .order("id")
      .range(de, ate)
  )
  const pessoas = await pessoasAtivas(f, linhas.map((a) => a.funcionario_id))
  return linhas
    .filter((a) => pessoas.has(String(a.funcionario_id)))
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
    .slice(0, 100)
    .map((a) => item(`ASO de ${pessoas.get(String(a.funcionario_id)) ?? "funcionário"}`, a.vencimento, "/painel/pessoal/aso", f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function ferias(f: Fonte): Promise<ItemVencimento[]> {
  const { data } = await f.svc
    .from("pessoal_ferias")
    .select("id, trabalhador_id, concessivo_termino")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("finalizado", "is", true)
    .not("concessivo_termino", "is", null)
    .lte("concessivo_termino", somarDias(f.hoje, 120))
    .order("concessivo_termino")
    .limit(100)
  const pessoas = await pessoasAtivas(f, (data ?? []).map((p) => p.trabalhador_id))
  return (data ?? [])
    .filter((p) => pessoas.has(String(p.trabalhador_id)))
    .map((p) => item(`Férias de ${pessoas.get(String(p.trabalhador_id))} (fim do período concessivo)`, p.concessivo_termino, "/painel/pessoal/ferias", f.hoje))
    .filter((i): i is ItemVencimento => i !== null)
}

async function treinamentos(f: Fonte): Promise<ItemVencimento[]> {
  const [{ data: cursos }, alunos] = await Promise.all([
    f.svc.from("pessoal_treinamentos").select("id, treinamento, vencimento_meses").eq("emp_proprietaria_id", f.tenantId).not("vencimento_meses", "is", null),
    // PostgREST corta em 1.000 linhas — matrículas em lotes (erro → vazio, como antes).
    lerEmLotes<{ id: string; aluno_id: unknown; treinamento_id: unknown; data_termino: unknown }>((de, ate) =>
      f.svc.from("pessoal_treinamentos_alunos").select("id, aluno_id, treinamento_id, data_termino").eq("emp_proprietaria_id", f.tenantId).not("data_termino", "is", null).order("id").range(de, ate)
    ).catch(() => []),
  ])
  const porCurso = new Map((cursos ?? []).map((c) => [String(c.id), c]))
  const pessoas = await pessoasAtivas(f, alunos.filter((a) => porCurso.has(String(a.treinamento_id))).map((a) => a.aluno_id))
  const limite = somarDias(f.hoje, 30)
  // Só a matrícula mais recente de cada pessoa no curso conta.
  const maisRecente = new Map<string, { aluno: string; curso: string; validoAte: string }>()
  for (const a of alunos) {
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

/**
 * Guias das retenções do RPA (onda 6 do plano do RPA): INSS RPA, IRRF RPA e
 * ISS RPA vencendo em 7 dias (ou vencidas há até 30) que ainda não foram
 * lançadas, ou lançadas com valor diferente da soma das retenções.
 */
async function guiasRpa(f: Fonte): Promise<ItemVencimento[]> {
  const { data: tributos } = await f.svc
    .from("financeiro_tributos")
    .select("id, nome, abreviacao")
    .eq("emp_proprietaria_id", f.tenantId)
    .not("retencao_rpa", "is", null)
  const porId = new Map((tributos ?? []).map((t) => [String(t.id), texto(t.abreviacao) ?? texto(t.nome) ?? "Tributo"]))
  if (porId.size === 0) return []
  const { data: guias } = await f.svc
    .from("financeiro_tributos_lancamentos")
    .select("id, tributo_id, competencia_inicio, valor, vencimento, situacao")
    .in("tributo_id", [...porId.keys()])
    .neq("situacao", "cancelado")
    .gte("vencimento", somarDias(f.hoje, -30))
    .lte("vencimento", somarDias(f.hoje, 7))
    .order("vencimento")
    .limit(50)
  if (!guias?.length) return []
  const { data: rets } = await f.svc
    .from("financeiro_tributos_retencoes")
    .select("tributo_id, competencia, valor")
    .in("tributo_id", [...new Set(guias.map((g) => String(g.tributo_id)))])
    .in("competencia", [...new Set(guias.map((g) => String(g.competencia_inicio).slice(0, 10)))])
  const soma = new Map<string, number>()
  for (const r of rets ?? []) {
    const k = `${r.tributo_id}|${String(r.competencia).slice(0, 10)}`
    soma.set(k, Math.round(((soma.get(k) ?? 0) + Number(r.valor ?? 0)) * 100) / 100)
  }
  const itens: ItemVencimento[] = []
  for (const g of guias) {
    const comp = String(g.competencia_inicio).slice(0, 10)
    const esperado = soma.get(`${g.tributo_id}|${comp}`) ?? 0
    const nome = `${porId.get(String(g.tributo_id))} ${comp.slice(5, 7)}/${comp.slice(0, 4)}`
    let rotulo: string | null = null
    if (g.situacao === "aguardando_guia" && esperado > 0) {
      rotulo = `${nome} — guia de ${formatarMoeda(esperado)} ainda não lançada`
    } else if (g.situacao === "lancado" && Math.abs(Number(g.valor ?? 0) - esperado) > 0.005) {
      rotulo = `${nome} — guia de ${formatarMoeda(Number(g.valor ?? 0))}, retenções somam ${formatarMoeda(esperado)}`
    }
    const i = rotulo ? item(rotulo, g.vencimento, `/painel/financeiro/tributos/${g.tributo_id}`, f.hoje) : null
    if (i) itens.push(i)
  }
  return itens
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
    { chave: "locacao_cobrancas", titulo: "Contratos de aluguel: cobranças e uso", permissao: { chave: "veiculos_gestao", alternativas: [] }, itens: await seguro(() => cobrancasLocacao(f)) },
    { chave: "apontamentos", titulo: "Apontamentos de checklist", permissao: { chave: "veiculos_gestao", alternativas: [] }, itens: await seguro(() => apontamentosChecklist(f)) },
    { chave: "asos", titulo: "ASO", permissao: { chave: "pessoal_gestao", alternativas: ["pessoal_aso"] }, itens: await seguro(() => asos(f)) },
    { chave: "ferias", titulo: "Férias (período concessivo)", permissao: { chave: "pessoal_gestao", alternativas: [] }, itens: await seguro(() => ferias(f)) },
    { chave: "treinamentos", titulo: "Treinamentos", permissao: { chave: "pessoal_gestao", alternativas: [] }, itens: await seguro(() => treinamentos(f)) },
    { chave: "faturas", titulo: "Faturas de viagem", permissao: { chave: "viagens_gestao", alternativas: [] }, itens: await seguro(() => faturasViagem(f)) },
    { chave: "guias_rpa", titulo: "Guias das retenções do RPA", permissao: { chave: "financeiro_tributos", alternativas: [] }, itens: await seguro(() => guiasRpa(f)) },
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

/**
 * Prazo vencido de verdade (sem os alertas com nota) — o que o painel, o
 * relatório da diretoria e o resumo semanal contam como "vencido".
 */
export function prazoVencido(i: ItemVencimento): boolean {
  return !i.nota && i.dias < 0
}

/** Prazo que vence nos próximos `dias` (sem os alertas com nota). */
export function prazoAVencer(i: ItemVencimento, dias: number): boolean {
  return !i.nota && i.dias >= 0 && i.dias <= dias
}

/** Atrasado: o prazo passou — ou o alerta diz que sim (`atrasado`). */
function atrasado(i: ItemVencimento): boolean {
  return i.atrasado ?? i.dias < 0
}

function quando(i: ItemVencimento): string {
  if (i.nota) return i.nota
  if (i.dias < 0) return `vencido há ${-i.dias} dia${i.dias === -1 ? "" : "s"}`
  if (i.dias === 0) return "vence hoje"
  return `vence em ${i.dias} dia${i.dias === 1 ? "" : "s"} (${formatarData(i.data)})`
}

export function textoResumo(grupos: GrupoVencimento[]): string {
  const total = grupos.reduce((s, g) => s + g.itens.length, 0)
  // Alerta (com nota) atrasado é "urgente": apontamento aberto não "vence".
  const vencidos = grupos.reduce((s, g) => s + g.itens.filter((i) => atrasado(i) && !i.nota).length, 0)
  const urgentes = grupos.reduce((s, g) => s + g.itens.filter((i) => atrasado(i) && i.nota).length, 0)
  const partes = grupos.map((g) => {
    const v = g.itens.filter(atrasado).length
    const palavra = g.itens.some((i) => i.nota) ? "urgente" : "vencido"
    return `${g.titulo}: ${g.itens.length}${v ? ` (${v} ${palavra}${v === 1 ? "" : "s"})` : ""}`
  })
  const destaque = [
    vencidos ? `${vencidos} já vencido${vencidos === 1 ? "" : "s"}` : "",
    urgentes ? `${urgentes} urgente${urgentes === 1 ? "" : "s"}` : "",
  ].filter(Boolean)
  return `Resumo de vencimentos: ${total} ${total === 1 ? "item" : "itens"}${destaque.length ? `, ${destaque.join(" e ")}` : ""}. ${partes.join("; ")}.`
}

const MAX_POR_GRUPO = 8

export function htmlResumo(grupos: GrupoVencimento[], origem: string): string {
  const blocos = grupos
    .map((g) => {
      const itens = g.itens
        .slice(0, MAX_POR_GRUPO)
        .map((i) => `<li style="margin:0 0 6px;${atrasado(i) ? "color:#b91c1c;" : ""}"><a href="${origem}${i.href}" style="color:inherit;">${escaparHtml(i.rotulo)}</a> — ${quando(i)}</li>`)
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
