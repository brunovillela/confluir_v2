import "server-only"

import { hojeSP, lerEmLotes } from "@/lib/db/comum"
import { contatosDaFolhaDe, emailDeCobranca, type ItemCobranca } from "@/lib/db/repasse-cobranca"
import { dataBr } from "@/lib/db/desconto-comunicacoes"
import {
  competenciaCorrente,
  garantirRemessas,
  invalidarAvisosRepasse,
  quadroRepasse,
  registrarEventoRepasse,
  regrasRepasse,
  tiposControlados,
} from "@/lib/db/repasse"
import { enviarEmail } from "@/lib/email"
import { escaparHtml, paragrafo, tituloEmail } from "@/lib/email-layout"
import { rotuloCompetencia, somarMeses, type TipoContribuicao } from "@/lib/repasse"
import { createAdminClient } from "@/lib/supabase/admin"
import { origemAtual } from "@/lib/tenant-url"
import { tenantAtual } from "@/lib/tenant"

/**
 * Cobrança automática das relações de desconto (15/11/2026). Roda uma vez por
 * dia em cada entidade, pela tarefa /api/repasse/tick, com a entidade fixada
 * (lib/tenant-contexto.ts). Com a opção ligada na entidade:
 *  - LEMBRETE: a relação vence em até N dias (filiacao_lembrete_dias) e ainda
 *    não chegou → um e-mail por empresa, uma vez por competência;
 *  - COBRANÇA: relação ou depósito atrasado → um e-mail por empresa com tudo o
 *    que falta, no dia seguinte ao prazo e de novo a cada 7 dias, no máximo 3
 *    vezes por competência. Cobrança ou contato registrado por alguém nos
 *    últimos 7 dias segura a automática.
 * Empresa marcada "fora da cobrança automática" (empresa.repasse_cobranca_
 * automatica = false) ou sem contato da folha com e-mail fica de fora.
 */

const REPETIR_DIAS = 7
const MAX_AUTOMATICAS = 3
const AUTOR = "Confluir (automático)"
const PREFIXO_AUTOMATICA = "Cobrança automática"

export type ConfigCobrancaAutomatica = { disponivel: boolean; ligada: boolean; lembreteDias: number }

export async function configCobrancaAutomatica(): Promise<ConfigCobrancaAutomatica> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa")
    .select("filiacao_cobranca_automatica, filiacao_lembrete_dias")
    .eq("id", await tenantAtual())
    .maybeSingle()
  if (error) return { disponivel: false, ligada: false, lembreteDias: 3 }
  return {
    disponivel: true,
    ligada: data?.filiacao_cobranca_automatica === true,
    lembreteDias: Number(data?.filiacao_lembrete_dias ?? 3),
  }
}

export async function salvarConfigCobranca(ligada: boolean, lembreteDias: number): Promise<{ erro?: string }> {
  if (!Number.isInteger(lembreteDias) || lembreteDias < 0 || lembreteDias > 15) return { erro: "O lembrete vai de 0 a 15 dias antes." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("empresa")
    .update({ filiacao_cobranca_automatica: ligada, filiacao_lembrete_dias: lembreteDias, updated_at: new Date().toISOString() })
    .eq("id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}

/** A fonte pagadora entra na cobrança automática? */
export async function empresaNaCobrancaAutomatica(empresaId: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin.from("empresa").select("repasse_cobranca_automatica").eq("id", empresaId).maybeSingle()
  return data?.repasse_cobranca_automatica !== false
}

export async function marcarEmpresaNaCobrancaAutomatica(empresaId: string, incluida: boolean): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("empresa")
    .update({ repasse_cobranca_automatica: incluida, updated_at: new Date().toISOString() })
    .eq("id", empresaId)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export type ResultadoAutomatico = {
  remessasCriadas: number
  lembretes: number
  cobrancas: number
  empresas: string[]
  ignoradas: string[]
  erros: string[]
}

/** O trabalho do dia numa entidade (com a entidade já fixada). */
export async function rodarRepasseAutomatico(opcoes: { simular?: boolean } = {}): Promise<ResultadoAutomatico> {
  const r: ResultadoAutomatico = { remessasCriadas: 0, lembretes: 0, cobrancas: 0, empresas: [], ignoradas: [], erros: [] }
  r.remessasCriadas = opcoes.simular ? 0 : await garantirRemessas(true).catch((e) => {
    r.erros.push(`remessas: ${e instanceof Error ? e.message : String(e)}`)
    return 0
  })
  const [regras, config] = await Promise.all([regrasRepasse(), configCobrancaAutomatica()])
  if (!regras.disponivel || regras.desde === null || !config.ligada) return r

  const hoje = hojeSP()
  const corrente = competenciaCorrente(hoje)
  const de = somarMeses(corrente, -11)
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // Eventos da janela: lembretes já mandados e cobranças/contatos recentes.
  const eventos = await lerEmLotes<{ empresa_id: string; competencia: number; tipo: string; evento: string; data: string; observacao: string | null }>((a, b) =>
    admin
      .from("filiacao_repasse_eventos")
      .select("empresa_id, competencia, tipo, evento, data, observacao")
      .eq("emp_proprietaria_id", emp)
      .gte("competencia", de)
      .in("evento", ["lembrete", "cobranca", "contato"])
      .order("created_at")
      .order("id")
      .range(a, b)
  )
  const chave = (e: string, c: number, t: string) => `${e}|${c}|${t}`
  const lembrados = new Set(eventos.filter((e) => e.evento === "lembrete").map((e) => chave(e.empresa_id, e.competencia, e.tipo)))
  const ultimaCobranca = new Map<string, string>()
  const automaticas = new Map<string, number>()
  for (const e of eventos) {
    if (e.evento === "lembrete") continue
    const k = chave(e.empresa_id, e.competencia, e.tipo)
    if (!ultimaCobranca.has(k) || e.data > ultimaCobranca.get(k)!) ultimaCobranca.set(k, e.data)
    if (e.observacao?.startsWith(PREFIXO_AUTOMATICA)) automaticas.set(k, (automaticas.get(k) ?? 0) + 1)
  }
  const limiteRepeticao = somarDias(hoje, -REPETIR_DIAS)

  type Pendencia = ItemCobranca & { situacao: "lembrete" | "cobranca" }
  const porEmpresa = new Map<string, { nome: string; itens: Pendencia[] }>()
  for (const tipo of tiposControlados(regras) as TipoContribuicao[]) {
    const q = await quadroRepasse({ tipo, ate: corrente, meses: 12 })
    for (const l of q.linhas) {
      for (const c of l.celulas) {
        if (c.competencia < regras.desde) continue
        const k = chave(l.id, c.competencia, tipo)
        let situacao: Pendencia["situacao"] | null = null
        if (c.situacao === "aguardando" && config.lembreteDias > 0 && !lembrados.has(k) && c.prazoEnvio <= somarDias(hoje, config.lembreteDias)) {
          situacao = "lembrete"
        } else if (
          (c.situacao === "atrasada" || c.situacao === "falta_deposito") &&
          (automaticas.get(k) ?? 0) < MAX_AUTOMATICAS &&
          !((ultimaCobranca.get(k) ?? "") > limiteRepeticao)
        ) {
          situacao = "cobranca"
        }
        if (!situacao) continue
        const e = porEmpresa.get(l.id) ?? { nome: l.nome, itens: [] }
        e.itens.push({
          competencia: c.competencia,
          tipo,
          falta: c.situacao === "falta_deposito" ? "deposito" : "relacao",
          prazo: c.situacao === "falta_deposito" ? c.prazoDeposito : c.prazoEnvio,
          valor: c.valor,
          situacao,
        })
        porEmpresa.set(l.id, e)
      }
    }
  }
  if (porEmpresa.size === 0) return r

  const ids = [...porEmpresa.keys()]
  const [contatos, foraDaAutomatica, links] = await Promise.all([
    contatosDaFolhaDe(ids),
    (async () => {
      const { data } = await admin.from("empresa").select("id").in("id", ids).eq("repasse_cobranca_automatica", false)
      return new Set((data ?? []).map((d) => d.id))
    })(),
    (async () => {
      const { data } = await admin.from("filiacao_repasse_links").select("empresa_id, token").eq("emp_proprietaria_id", emp).is("revogado_em", null).in("empresa_id", ids)
      const origem = await origemAtual()
      return new Map((data ?? []).map((x) => [x.empresa_id, `${origem}/relacao/${x.token}`]))
    })(),
  ])

  for (const [empresaId, e] of porEmpresa) {
    const destinos = (contatos.get(empresaId) ?? []).filter((c) => c.email)
    if (foraDaAutomatica.has(empresaId) || destinos.length === 0) {
      r.ignoradas.push(`${e.nome} (${foraDaAutomatica.has(empresaId) ? "fora da cobrança automática" : "sem contato da folha com e-mail"})`)
      continue
    }
    const link = links.get(empresaId) ?? null
    const lembretes = e.itens.filter((i) => i.situacao === "lembrete")
    const cobrancas = e.itens.filter((i) => i.situacao === "cobranca")
    const envios: { tipo: "lembrete" | "cobranca"; itens: Pendencia[]; assunto: string; html: string }[] = []
    if (lembretes.length) {
      envios.push({
        tipo: "lembrete",
        itens: lembretes,
        assunto: `Lembrete: relação de descontos de ${lembretes.map((i) => rotuloCompetencia(i.competencia)).join(", ")} — {ENTIDADE}`,
        html:
          tituloEmail("Lembrete: relação de descontos") +
          paragrafo(`Prezados(as) da ${escaparHtml(e.nome)},`) +
          paragrafo("Lembramos o prazo para o envio da relação dos descontos das contribuições:") +
          `<ul style="margin:8px 0 16px;padding-left:20px">${lembretes
            .map((i) => `<li>Contribuição ${escaparHtml(i.tipo.toLowerCase())} de <strong>${rotuloCompetencia(i.competencia)}</strong> — até ${dataBr(i.prazo)}</li>`)
            .join("")}</ul>` +
          (link
            ? paragrafo(`Vocês podem enviar pela página da empresa: <a href="${link}">${escaparHtml(link)}</a>. Se não houve desconto, basta informar por lá.`)
            : paragrafo("Basta responder a este e-mail com a relação. Se não houve desconto, é só nos avisar.")) +
          paragrafo("Se já enviaram, desconsiderem esta mensagem. Obrigado(a)."),
      })
    }
    if (cobrancas.length) {
      const { assunto, html } = emailDeCobranca({ empresa: e.nome, itens: cobrancas, link, extra: null })
      envios.push({ tipo: "cobranca", itens: cobrancas, assunto, html })
    }
    for (const envio of envios) {
      if (opcoes.simular) {
        r[envio.tipo === "lembrete" ? "lembretes" : "cobrancas"] += 1
        r.empresas.push(`${e.nome}: ${envio.tipo} (${envio.itens.map((i) => rotuloCompetencia(i.competencia)).join(", ")})`)
        continue
      }
      const enviados: string[] = []
      for (const c of destinos) {
        if (await enviarEmail({ email: c.email!, nome: c.nome, assunto: envio.assunto, html: envio.html }).catch(() => false)) enviados.push(c.email!)
      }
      if (enviados.length === 0) {
        r.erros.push(`${e.nome}: o e-mail não saiu`)
        continue
      }
      for (const i of envio.itens) {
        const k = chave(empresaId, i.competencia, i.tipo)
        const n = (automaticas.get(k) ?? 0) + 1
        await registrarEventoRepasse({
          empresaId,
          competencia: i.competencia,
          tipo: i.tipo,
          evento: envio.tipo,
          meio: "email",
          data: hoje,
          observacao:
            envio.tipo === "lembrete"
              ? `Lembrete automático do prazo (${dataBr(i.prazo)}) enviado para ${enviados.join(", ")}.`
              : `${PREFIXO_AUTOMATICA} (${n}/${MAX_AUTOMATICAS}) ${i.falta === "deposito" ? "do depósito" : "da relação"} enviada para ${enviados.join(", ")}.`,
          usuarioId: null,
          usuarioNome: AUTOR,
        })
      }
      r[envio.tipo === "lembrete" ? "lembretes" : "cobrancas"] += 1
      r.empresas.push(`${e.nome}: ${envio.tipo}`)
    }
  }
  invalidarAvisosRepasse()
  return r
}
