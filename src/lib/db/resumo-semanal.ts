import "server-only"

import { avisar, type Destinatario } from "@/lib/db/avisos"
import { hojeSP, texto } from "@/lib/db/comum"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { somarDias } from "@/lib/db/ferias"
import { SITUACOES_ABERTAS } from "@/lib/db/financeiro"
import { DIAS_PARADA, pendenciasPara, totalPendencias } from "@/lib/db/pendencias"
import { gruposDaPessoa, vencimentosDoTenant, type GrupoVencimento } from "@/lib/db/vencimentos"
import { escaparHtml, paragrafo, textoSuave } from "@/lib/email-layout"
import { formatarMoeda } from "@/lib/formato"
import { PERMISSOES_USUARIO_FK, podeAcessar, type Permissoes } from "@/lib/permissoes"
import { resolverPermissoes } from "@/lib/permissoes-resolver"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * RESUMO SEMANAL DE GESTÃO (onda 3, I10): toda segunda, quem gere recebe o
 * retrato da semana — filiação (entradas, saídas, ativos), financeiro
 * (abertas, vencidas, vencendo em 7 dias), demandas e anomalias abertas, o
 * que está parado na própria caixa e o que venceu ou vence na semana nas
 * áreas que a pessoa cuida. Cada bloco só entra para quem tem a permissão;
 * sem nada a dizer, não manda. Roda fora de requisição (service role, tenant
 * explícito), uma vez por semana por pessoa (dedupe por prefixo no dia).
 */

type Retrato = {
  hoje: string
  filiacao: { ativos: number; entradas7d: number; saidas7d: number } | null
  financeiro: { abertas: { q: number; v: number }; vencidas: { q: number; v: number }; vencendo7d: { q: number; v: number } }
  demandas: { aFazer: number; fazendo: number } | null
  anomaliasAbertas: number | null
  vencimentos: GrupoVencimento[]
}

async function contar(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await q
    return error ? null : (count ?? 0)
  } catch {
    return null
  }
}

async function retratoDoTenant(tenantId: string): Promise<Retrato> {
  const svc = createServiceClient()
  const hoje = hojeSP()
  const ha7 = somarDias(hoje, -7)
  const em7 = somarDias(hoje, 7)

  const [ativos, entradas7d, saidas7d, aFazer, fazendo, anomalias, vencimentos] = await Promise.all([
    contar(svc.from("filiacoes").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", tenantId).eq("filiacao_condicao", "Ativo").not("filiacao_excluida", "is", true)),
    contar(svc.from("filiacoes").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", tenantId).gte("ativo_em", ha7)),
    contar(svc.from("filiacoes").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", tenantId).gte("inativo_em", ha7)),
    contar(svc.from("demandas").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", tenantId).eq("situacao", "A fazer")),
    contar(svc.from("demandas").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", tenantId).eq("situacao", "Fazendo")),
    contar(svc.from("ferramentas_anomalias").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", tenantId).not("eficacia_verificada", "is", true)),
    vencimentosDoTenant(tenantId).catch(() => [] as GrupoVencimento[]),
  ])

  const financeiro = { abertas: { q: 0, v: 0 }, vencidas: { q: 0, v: 0 }, vencendo7d: { q: 0, v: 0 } }
  const { data: abertas } = await svc
    .from("ordens_pagamento")
    .select("vencimento, valor_inicial_cobranca, valor_pago")
    .eq("emp_proprietaria_id", tenantId)
    .not("excluido", "is", true)
    .in("situacao", [...SITUACOES_ABERTAS])
    .limit(1000)
  for (const o of abertas ?? []) {
    const v = Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0)
    financeiro.abertas.q++
    financeiro.abertas.v += v
    const venc = texto(o.vencimento)?.slice(0, 10)
    if (!venc) continue
    if (venc < hoje) {
      financeiro.vencidas.q++
      financeiro.vencidas.v += v
    } else if (venc <= em7) {
      financeiro.vencendo7d.q++
      financeiro.vencendo7d.v += v
    }
  }

  return {
    hoje,
    filiacao: ativos === null ? null : { ativos, entradas7d: entradas7d ?? 0, saidas7d: saidas7d ?? 0 },
    financeiro,
    demandas: aFazer === null ? null : { aFazer, fazendo: fazendo ?? 0 },
    anomaliasAbertas: anomalias,
    vencimentos,
  }
}

type Bloco = { titulo: string; linhas: string[]; href?: string }

function blocosDaPessoa(r: Retrato, permissoes: Permissoes, pendencias: { titulo: string; quantidade: number; antigas?: number }[]): Bloco[] {
  const pode = (c: string, alt: string[] = []) => podeAcessar(permissoes, c, alt)
  const blocos: Bloco[] = []
  const totalPend = pendencias.reduce((s, p) => s + p.quantidade, 0)
  const paradas = pendencias.reduce((s, p) => s + (p.antigas ?? 0), 0)
  if (totalPend > 0) {
    blocos.push({
      titulo: "Na sua caixa de entrada",
      linhas: [`${totalPend} pendência${totalPend === 1 ? "" : "s"}${paradas ? `, ${paradas} parada${paradas === 1 ? "" : "s"} há mais de ${DIAS_PARADA} dias` : ""}`],
      href: "/painel#caixa-entrada",
    })
  }
  if (r.filiacao && pode("filiacao_gestao", ["filiacao_filiados", "filiacao_receitas", "configuracoes"])) {
    blocos.push({
      titulo: "Filiação",
      linhas: [`${r.filiacao.ativos.toLocaleString("pt-BR")} filiados ativos`, `${r.filiacao.entradas7d} novas filiações e ${r.filiacao.saidas7d} desfiliações nos últimos 7 dias`],
      href: "/painel/filiados",
    })
  }
  if (pode("financeiro_leitura", ["financeiro_pagamento", "configuracoes"])) {
    const f = r.financeiro
    blocos.push({
      titulo: "Financeiro",
      linhas: [
        `${f.abertas.q} ordens abertas (${formatarMoeda(f.abertas.v)})`,
        `${f.vencidas.q} vencidas (${formatarMoeda(f.vencidas.v)})`,
        `${f.vencendo7d.q} vencem nos próximos 7 dias (${formatarMoeda(f.vencendo7d.v)})`,
      ],
      href: "/painel/financeiro/gerencial",
    })
  }
  if (r.demandas && pode("ferramentas_demandas", ["ferramentas_tarefas"])) {
    blocos.push({ titulo: "Demandas", linhas: [`${r.demandas.aFazer} a fazer, ${r.demandas.fazendo} em andamento`], href: "/painel/ferramentas/demandas" })
  }
  if (r.anomaliasAbertas !== null && r.anomaliasAbertas > 0 && pode("ferramentas_anomalias", ["ferramentas_demandas"])) {
    blocos.push({ titulo: "Anomalias", linhas: [`${r.anomaliasAbertas} sem eficácia verificada`], href: "/painel/ferramentas/anomalias" })
  }
  const meus = gruposDaPessoa(r.vencimentos, permissoes)
  const vencidos = meus.map((g) => ({ g, n: g.itens.filter((i) => i.dias < 0).length })).filter((x) => x.n > 0)
  const semana = meus.map((g) => ({ g, n: g.itens.filter((i) => i.dias >= 0 && i.dias <= 7).length })).filter((x) => x.n > 0)
  if (vencidos.length || semana.length) {
    blocos.push({
      titulo: "Vencimentos nas suas áreas",
      linhas: [
        ...vencidos.map((x) => `${x.g.titulo}: ${x.n} vencido${x.n === 1 ? "" : "s"}`),
        ...semana.map((x) => `${x.g.titulo}: ${x.n} vence${x.n === 1 ? "" : "m"} nesta semana`),
      ],
    })
  }
  return blocos
}

export function textoResumoSemanal(blocos: Bloco[]): string {
  return `Resumo semanal: ${blocos.map((b) => `${b.titulo} — ${b.linhas.join("; ")}`).join(". ")}.`
}

function htmlResumoSemanal(blocos: Bloco[], origem: string): string {
  return (
    paragrafo("O retrato da semana nas áreas que você gere:") +
    blocos
      .map(
        (b) =>
          `<p style="margin:14px 0 4px;font-weight:600;">${b.href ? `<a href="${origem}${b.href}" style="color:inherit;">${escaparHtml(b.titulo)}</a>` : escaparHtml(b.titulo)}</p>` +
          `<ul style="margin:0;padding-left:20px;">${b.linhas.map((l) => `<li style="margin:0 0 4px;">${escaparHtml(l)}</li>`).join("")}</ul>`
      )
      .join("") +
    textoSuave("Este resumo sai toda segunda-feira. Para desligá-lo, abra Meu perfil → Avisos.")
  )
}

export async function enviarResumoSemanal(tenantId: string): Promise<{ pessoas: number; resumos: number }> {
  const svc = createServiceClient()
  const [retrato, contexto] = await Promise.all([retratoDoTenant(tenantId), contextoDoTenant(tenantId, svc)])

  const { data: acessos } = await svc.from("permissoes").select("*").eq("emp_proprietaria_id", tenantId).not(PERMISSOES_USUARIO_FK, "is", null)
  const porUsuario = new Map<string, Permissoes>()
  for (const a of acessos ?? []) porUsuario.set(String(a[PERMISSOES_USUARIO_FK]), a as Permissoes)
  if (porUsuario.size === 0) return { pessoas: 0, resumos: 0 }
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
    const email = texto(u.email)
    const pendencias = await pendenciasPara({ client: svc, emp: tenantId, permissoes, email, comAntigas: true }).catch(() => [])
    const blocos = blocosDaPessoa(retrato, permissoes, pendencias)
    // Só a caixa de entrada vazia não justifica um resumo; gestão de área, sim.
    if (blocos.length === 0 || (blocos.length === 1 && blocos[0].titulo === "Na sua caixa de entrada" && totalPendencias(pendencias) === 0)) continue
    const d: Destinatario = { id, nome: texto(u.nome_completo) ?? texto(u.nome_guerra), email, permissoes }
    resumos += await avisar(
      [d],
      {
        texto: textoResumoSemanal(blocos),
        link: "/painel/indicadores",
        evento: "resumo_semanal",
        assunto: `Resumo semanal de gestão — ${contexto.entidade}`,
        html: htmlResumoSemanal(blocos, contexto.origem),
        umaVezPorDia: true,
        prefixoDoDia: "Resumo semanal:",
      },
      { client: svc, tenantId, contexto }
    )
  }
  return { pessoas: (usuarios ?? []).length, resumos }
}
