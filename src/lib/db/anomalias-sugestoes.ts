import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  DIAS_COMPRAS_CANCELADAS,
  DIAS_INFRACOES,
  DIAS_RECENTES,
  LIMIARES_SUGESTAO,
  ehOrigemSugestao,
  recorrentes,
  trimestreDe,
  type OrigemSugestao,
} from "@/lib/anomalias-sugestoes-constantes"
import { avisar, usuariosComPermissao } from "@/lib/db/avisos"
import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { criarAnomalia } from "@/lib/db/nucleo"
import { avaliarJornada } from "@/lib/db/ponto-marcacoes"
import type { MarcacoesEspelho } from "@/lib/ponto-marcacoes-ajuste"
import { somarDias } from "@/lib/deliberacoes-constantes"
import type { ContextoEmail } from "@/lib/email"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * SUGESTÕES DE ANOMALIA (19/11/2026), no tick diário das pendências: o
 * sistema procura o que já registra e sugere a anomalia, já com o fato e a
 * descrição; quem tem Anomalias abre ou descarta (Ferramentas → Anomalias).
 * Cada ocorrência tem uma chave e só é sugerida uma vez; as recorrências
 * (compras canceladas, infrações) no máximo uma vez por trimestre.
 */

type Linha = Record<string, unknown>
type Sugestao = {
  origem: OrigemSugestao
  chave: string
  fato: string
  descricao: string | null
  data_ocorrencia: string | null
  link: string | null
}

function dataBR(iso: string | null): string {
  if (!iso) return "?"
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

async function nomes(client: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  const mapa = new Map<string, string>()
  for (let i = 0; i < unicos.length; i += 200) {
    const { data } = await client.from("usuarios").select("id, nome_completo, nome_guerra").in("id", unicos.slice(i, i + 200))
    for (const u of (data ?? []) as Linha[]) mapa.set(String(u.id), texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "(sem nome)")
  }
  return mapa
}

/** Devoluções de veículo com o km fora do normal confirmado na recepção. */
async function kmAnormal(client: SupabaseClient, emp: string, hoje: string): Promise<Sugestao[]> {
  const { data, error } = await client
    .from("veiculos_disponibilidade")
    .select("id, veiculo_id, condutor_id, data_devolucao, observacao_retorno, km_rodado")
    .eq("emp_proprietaria_id", emp)
    .ilike("observacao_retorno", "%Km fora do normal%")
    .gte("data_devolucao", somarDias(hoje, -DIAS_RECENTES))
    .limit(500)
  if (error) throw error
  const linhas = (data ?? []) as Linha[]
  if (!linhas.length) return []
  const { data: vs } = await client.from("veiculos").select("id, placa, marca_modelo").in("id", [...new Set(linhas.map((l) => String(l.veiculo_id)))])
  const veiculo = new Map(((vs ?? []) as Linha[]).map((v) => [String(v.id), [texto(v.marca_modelo), texto(v.placa)].filter(Boolean).join(" ")]))
  const condutor = await nomes(client, linhas.map((l) => String(l.condutor_id ?? "")))
  return linhas.map((l) => {
    const qual = veiculo.get(String(l.veiculo_id)) || "veículo"
    const quem = l.condutor_id ? condutor.get(String(l.condutor_id)) : null
    return {
      origem: "km_anormal",
      chave: String(l.id),
      fato: `Km fora do normal na devolução do ${qual}`,
      descricao: [
        `Devolução em ${dataBR(texto(l.data_devolucao))}${quem ? `, condutor ${quem}` : ""}${l.km_rodado != null ? `, ${l.km_rodado} km rodados` : ""}.`,
        texto(l.observacao_retorno),
      ]
        .filter(Boolean)
        .join("\n"),
      data_ocorrencia: texto(l.data_devolucao),
      link: l.condutor_id ? `/painel/veiculos/condutores/${l.condutor_id}` : `/painel/veiculos/${l.veiculo_id}`,
    }
  })
}

/** Ordens de pagamento devolvidas LIMIARES.ordemDevolvida vezes ou mais, a última recente. */
async function ordensDevolvidas(client: SupabaseClient, emp: string, hoje: string): Promise<Sugestao[]> {
  const { data, error } = await client
    .from("ordens_pagamento_eventos")
    .select("ordem_id, created_at")
    .eq("emp_proprietaria_id", emp)
    .eq("tipo", "devolvida")
    .gte("created_at", `${somarDias(hoje, -365)}T00:00:00Z`)
    .limit(5000)
  if (error) throw error
  const grupos = recorrentes(
    ((data ?? []) as Linha[]).map((e) => ({ quem: String(e.ordem_id), data: String(e.created_at).slice(0, 10) })),
    LIMIARES_SUGESTAO.ordemDevolvida
  ).filter((g) => g.ultima >= somarDias(hoje, -DIAS_RECENTES))
  if (!grupos.length) return []
  const { data: os } = await client.from("ordens_pagamento").select("id, codigo, descricao").in("id", grupos.map((g) => g.quem))
  const ordem = new Map(((os ?? []) as Linha[]).map((o) => [String(o.id), o]))
  return grupos.map((g) => {
    const o = ordem.get(g.quem)
    const codigo = texto(o?.codigo)
    return {
      origem: "ordem_devolvida",
      chave: g.quem,
      fato: `Ordem de pagamento ${codigo ?? ""} devolvida ${g.quantidade} vezes`.replace("  ", " "),
      descricao: `A ordem foi devolvida pelo avaliador ${g.quantidade} vezes; a última em ${dataBR(g.ultima)}.${
        texto(o?.descricao) ? `\nDescrição da ordem: ${texto(o?.descricao)}` : ""
      }`,
      data_ocorrencia: g.ultima,
      link: `/painel/financeiro/ordens/${g.quem}`,
    }
  })
}

/** Registros de ponto (mês do funcionário) com LIMIARES.pontoIncompleto dias ou mais de marcação incompleta. */
async function pontoIncompleto(client: SupabaseClient, emp: string, hoje: string): Promise<Sugestao[]> {
  const { data: rems, error } = await client
    .from("pessoal_registro_ponto_remessas")
    .select("id, nome_remessa")
    .eq("emp_proprietaria_id", emp)
    .gte("created_at", `${somarDias(hoje, -(DIAS_RECENTES + 40))}T00:00:00Z`)
  if (error) throw error
  const remessa = new Map(((rems ?? []) as Linha[]).map((r) => [String(r.id), texto(r.nome_remessa) ?? "Remessa"]))
  if (!remessa.size) return []
  const { data: regs, error: e2 } = await client
    .from("pessoal_registro_ponto")
    .select("id, remessa_id, funcionario_id, marcacoes")
    .in("remessa_id", [...remessa.keys()])
    .not("marcacoes", "is", null)
    .range(0, 4999)
  if (e2) throw e2
  const achados = ((regs ?? []) as Linha[])
    .map((r) => ({ r, dias: avaliarJornada(r.marcacoes as MarcacoesEspelho | null)?.incompletas ?? [] }))
    .filter((x) => x.r.funcionario_id && x.dias.length >= LIMIARES_SUGESTAO.pontoIncompleto)
  if (!achados.length) return []
  const funcionario = await nomes(client, achados.map((x) => String(x.r.funcionario_id)))
  return achados.map(({ r, dias }) => {
    const quem = funcionario.get(String(r.funcionario_id)) ?? "funcionário"
    const ordenados = [...dias].sort()
    return {
      origem: "ponto_incompleto",
      chave: String(r.id),
      fato: `Marcação de ponto incompleta em ${dias.length} dias (${quem})`,
      descricao: `${remessa.get(String(r.remessa_id))}: marcação incompleta (número ímpar de batidas) em ${ordenados.map((d) => dataBR(d).slice(0, 5)).join(", ")}.`,
      data_ocorrencia: ordenados.at(-1) ?? null,
      link: `/painel/pessoal/ponto/funcionario/${r.funcionario_id}/${r.id}`,
    }
  })
}

/** Fornecedor com LIMIARES.comprasCanceladas compras canceladas ou mais em DIAS_COMPRAS_CANCELADAS dias. */
async function comprasCanceladas(client: SupabaseClient, emp: string, hoje: string): Promise<Sugestao[]> {
  const { data, error } = await client
    .from("compras_fornecimentos")
    .select("id, fornecedor_id, cancelamento_data, cancelamento_desfecho")
    .eq("emp_proprietaria_id", emp)
    .not("cancelamento_desfecho", "is", null)
    .gte("cancelamento_data", somarDias(hoje, -DIAS_COMPRAS_CANCELADAS))
    .limit(2000)
  if (error) throw error
  const grupos = recorrentes(
    ((data ?? []) as Linha[])
      .filter((f) => f.fornecedor_id && f.cancelamento_data)
      .map((f) => ({ quem: String(f.fornecedor_id), data: String(f.cancelamento_data) })),
    LIMIARES_SUGESTAO.comprasCanceladas
  )
  if (!grupos.length) return []
  const { data: emps } = await client.from("empresa").select("id, nome_fantasia, nome_razao").in("id", grupos.map((g) => g.quem))
  const nome = new Map(((emps ?? []) as Linha[]).map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "fornecedor"]))
  return grupos.map((g) => ({
    origem: "compras_canceladas",
    chave: `${g.quem}:${trimestreDe(hoje)}`,
    fato: `${g.quantidade} compras canceladas pelo fornecedor ${nome.get(g.quem) ?? ""} em ${DIAS_COMPRAS_CANCELADAS} dias`.replace("  ", " "),
    descricao: `Cancelamentos em ${g.itens.map((i) => dataBR(i.data)).sort().join(", ")}. Vale conferir se o fornecedor deve continuar sendo usado.`,
    data_ocorrencia: g.ultima,
    link: `/painel/compras/fornecedores/${g.quem}`,
  }))
}

/** Condutor com LIMIARES.infracoes infrações de trânsito ou mais em DIAS_INFRACOES dias. */
async function infracoesDoCondutor(client: SupabaseClient, emp: string, hoje: string): Promise<Sugestao[]> {
  const { data: vs, error } = await client.from("veiculos").select("id").eq("emp_proprietaria_id", emp)
  if (error) throw error
  const veiculos = ((vs ?? []) as Linha[]).map((v) => String(v.id))
  if (!veiculos.length) return []
  const { data, error: e2 } = await client
    .from("veiculos_infracoes")
    .select("id, condutor_infrator_id, infracao_data, infracao_tipo")
    .in("veiculo_id", veiculos)
    .not("condutor_infrator_id", "is", null)
    .gte("infracao_data", somarDias(hoje, -DIAS_INFRACOES))
    .limit(2000)
  if (e2) throw e2
  const grupos = recorrentes(
    ((data ?? []) as Linha[]).map((i) => ({ quem: String(i.condutor_infrator_id), data: String(i.infracao_data), tipo: texto(i.infracao_tipo) })),
    LIMIARES_SUGESTAO.infracoes
  )
  if (!grupos.length) return []
  const condutor = await nomes(client, grupos.map((g) => g.quem))
  return grupos.map((g) => ({
    origem: "infracoes_condutor",
    chave: `${g.quem}:${trimestreDe(hoje)}`,
    fato: `${condutor.get(g.quem) ?? "Condutor"} com ${g.quantidade} infrações de trânsito em 12 meses`,
    descricao: g.itens
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((i) => `${dataBR(i.data)}${i.tipo ? ` — ${i.tipo}` : ""}`)
      .join("\n"),
    data_ocorrencia: g.ultima,
    link: `/painel/veiculos/condutores/${g.quem}`,
  }))
}

/**
 * Procura e grava as sugestões novas da entidade (as já sugeridas ficam de
 * fora pela chave) e avisa quem tem Anomalias quando há novidade.
 */
export async function gerarSugestoesDeAnomalia(
  client: SupabaseClient,
  tenantId: string,
  contexto: ContextoEmail
): Promise<{ novas: number; erros: string[] }> {
  const hoje = hojeSP()
  const erros: string[] = []
  const fontes: [string, (c: SupabaseClient, e: string, h: string) => Promise<Sugestao[]>][] = [
    ["km", kmAnormal],
    ["ordens", ordensDevolvidas],
    ["ponto", pontoIncompleto],
    ["compras", comprasCanceladas],
    ["infracoes", infracoesDoCondutor],
  ]
  const todas: Sugestao[] = []
  for (const [nome, fonte] of fontes) {
    try {
      todas.push(...(await fonte(client, tenantId, hoje)))
    } catch (e) {
      if (!esquemaAusente(e as { code?: string })) erros.push(`${nome}: ${e instanceof Error ? e.message : String((e as { message?: string }).message ?? e)}`)
    }
  }
  if (!todas.length) return { novas: 0, erros }
  const { data, error } = await client
    .from("ferramentas_anomalias_sugestoes")
    .upsert(
      todas.map((s) => ({ ...s, emp_proprietaria_id: tenantId })),
      { onConflict: "emp_proprietaria_id,origem,chave", ignoreDuplicates: true }
    )
    .select("id")
  if (error) {
    if (!esquemaAusente(error)) erros.push(`gravar: ${error.message}`)
    return { novas: 0, erros }
  }
  const novas = (data ?? []).length
  if (novas > 0) {
    const amb = { client, tenantId, contexto }
    const equipe = await usuariosComPermissao("ferramentas_anomalias", [], amb)
    // Sem nomes nem detalhes no aviso (pode citar funcionário ou condutor): só a contagem.
    await avisar(
      equipe,
      {
        texto: `${novas} sugest${novas === 1 ? "ão" : "ões"} de anomalia nova${novas === 1 ? "" : "s"} para avaliar.`,
        link: "/painel/ferramentas/anomalias#sugestoes",
        evento: "anomalia_sugerida",
        assunto: "Sugestões de anomalia para avaliar",
        umaVezPorDia: true,
      },
      amb
    )
  }
  return { novas, erros }
}

// ── Tela (requisição) ────────────────────────────────────────────────────────

export type SugestaoAnomalia = {
  id: string
  origem: OrigemSugestao
  fato: string
  descricao: string | null
  dataOcorrencia: string | null
  link: string | null
  criadaEm: string
}

export async function listarSugestoesPendentes(): Promise<SugestaoAnomalia[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ferramentas_anomalias_sugestoes")
    .select("id, origem, fato, descricao, data_ocorrencia, link, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "pendente")
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler as sugestões: ${error.message}`)
  }
  return ((data ?? []) as Linha[])
    .filter((s) => ehOrigemSugestao(s.origem))
    .map((s) => ({
      id: String(s.id),
      origem: s.origem as OrigemSugestao,
      fato: String(s.fato),
      descricao: texto(s.descricao),
      dataOcorrencia: texto(s.data_ocorrencia),
      link: texto(s.link),
      criadaEm: String(s.created_at),
    }))
}

async function sugestaoPendente(id: string) {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ferramentas_anomalias_sugestoes")
    .select("id, fato, descricao, data_ocorrencia, link, situacao")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data && data.situacao === "pendente" ? { admin, s: data as Linha } : null
}

/** Abre a anomalia já preenchida (quem abre fica como responsável pela apuração). */
export async function abrirAnomaliaDaSugestao(id: string, usuarioId: string): Promise<{ erro?: string; anomaliaId?: string }> {
  const achada = await sugestaoPendente(id)
  if (!achada) return { erro: "Sugestão não encontrada ou já decidida." }
  const { admin, s } = achada
  const link = texto(s.link)
  const { id: anomaliaId, erro } = await criarAnomalia({
    fato: String(s.fato),
    conformidade: null,
    descricao_detalhada: [texto(s.descricao), link ? `Origem no painel: ${link}` : null, "Sugerida pelo sistema."].filter(Boolean).join("\n\n"),
    data_ocorrencia: texto(s.data_ocorrencia),
    responsavel_id: usuarioId,
    causa_raiz: null,
    investigacao_pq1: null,
    investigacao_pq2: null,
    investigacao_pq3: null,
    investigacao_pq4: null,
    investigacao_pq5: null,
    anomalia_investigada: false,
    anomalia_tratada: false,
    eficacia_verificada: false,
  })
  if (erro || !anomaliaId) return { erro: erro ?? "Falha ao abrir a anomalia." }
  await admin
    .from("ferramentas_anomalias_sugestoes")
    .update({ situacao: "aberta", anomalia_id: anomaliaId, decidido_por: usuarioId, decidido_em: new Date().toISOString() })
    .eq("id", id)
  return { anomaliaId }
}

export async function descartarSugestao(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const achada = await sugestaoPendente(id)
  if (!achada) return { erro: "Sugestão não encontrada ou já decidida." }
  const { error } = await achada.admin
    .from("ferramentas_anomalias_sugestoes")
    .update({ situacao: "descartada", decidido_por: usuarioId, decidido_em: new Date().toISOString() })
    .eq("id", id)
  if (error) return { erro: `Falha ao descartar: ${error.message}` }
  return {}
}

