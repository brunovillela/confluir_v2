import "server-only"

import { temVotoOnline } from "@/lib/assembleias-constantes"
import { dadosDoAviso, type AmbienteEnvio } from "@/lib/db/votacao-aviso"
import { MARCA_NAO_RECONHECE } from "@/lib/db/votacao-primeiro-acesso"
import { enviarEmail } from "@/lib/email"
import { marcaEmailVoto } from "@/lib/db/votacao-eventos-email"
import { assuntoAvisoAptos, diaHora, montarEmailAvisoAptos, type DadosAvisoAptos } from "@/lib/email-aviso-aptos"
import { escaparHtml } from "@/lib/email-layout"
import { createAdminClient } from "@/lib/supabase/admin"
import { enviarTelegram } from "@/lib/telegram"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * AVISO PELO CANAL QUE O APTO ESCOLHEU (fase 1 do plano de 21/10/2026,
 * docs/plano-votacao-entrega-preparacao.md).
 *
 * Na Halliburton, o link pessoal foi entregue ao e-mail corporativo e só o
 * robô de segurança da empresa o abriu. 971 pessoas cadastraram um e-mail
 * pessoal ou o Telegram no link geral — e o aviso continuou indo só para o
 * corporativo. Aqui o link pessoal sai também para esse contato:
 *
 *  - e-mail pessoal (`email_contato`): o mesmo e-mail do aviso;
 *  - Telegram (`telegram_chat_id`): mensagem curta com o botão do link. Sem
 *    CPF, sem empresa e sem nada do voto (AGENTS.md) — só a rodada e a janela.
 *
 * Quem já votou, votou na urna ou disse "não sou eu" não recebe. Marca
 * própria (`aviso_contato_*`, supabase/migrations/…_votacao_aviso_contato.sql),
 * separada da do e-mail corporativo. Roda junto do lote do aviso (botão e
 * envio automático) e, no tick, para quem se cadastra depois do primeiro envio.
 */

export type ResultadoLoteContato = {
  processados: number
  enviados: number
  falhas: number
  restantes: number
}

type AptoComContato = {
  id: string
  nome_completo: string | null
  assembleia_id: string | null
  email_contato: string | null
  telegram_chat_id: string | null
}

const VAZIO: ResultadoLoteContato = { processados: 0, enviados: 0, falhas: 0, restantes: 0 }

/** Janela da votação pela internet em texto ("quarta, 21/10/2026 às 10:40 até …"). */
function janelaEmTexto(dados: DadosAvisoAptos): string | null {
  const online = dados.assembleias.find((a) => temVotoOnline(a.modalidade))
  if (!online) return null
  const abre = diaHora(online.data_inicio, online.hora_inicio)
  const fecha = diaHora(online.data_termino, online.hora_termino)
  if (abre && fecha) return `de ${abre} até ${fecha}`
  return abre ? `a partir de ${abre}` : fecha ? `até ${fecha}` : null
}

export function mensagemTelegramAviso(dados: DadosAvisoAptos, nome: string | null): string {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0]
  const janela = janelaEmTexto(dados)
  return [
    `${primeiro ? `Olá, ${escaparHtml(primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase())}! ` : ""}Você está habilitado a votar: <b>${escaparHtml(dados.rodadaNome)}</b>.`,
    janela ? `🗳️ Votação pela internet ${escaparHtml(janela)} (horário de Brasília).` : null,
    "O botão abaixo é o seu link pessoal: abre a cédula direto, sem código. Não repasse a ninguém.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** Quantos aptos com contato ainda esperam o aviso por ele. */
async function contarPendentes(amb: { client: AmbienteEnvio["client"]; tenantId: string }, rodadaId: string): Promise<number> {
  const { count } = await amb.client
    .from("voto_assembleias_aptos")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", amb.tenantId)
    .eq("rod_assembleia_id", rodadaId)
    .is("aviso_contato_em", null)
    .is("hora_voto", null)
    .is("presenca_em", null)
    .or("email_contato.not.is.null,telegram_chat_id.not.is.null")
  return count ?? 0
}

/** Processa até `limite` aptos com contato ainda não avisados por ele. */
export async function enviarLoteAvisoContato(
  rodadaId: string,
  limite = 60,
  amb?: AmbienteEnvio
): Promise<{ resultado?: ResultadoLoteContato; erro?: string }> {
  const client = amb?.client ?? (await createAdminClient())
  const emp = amb?.tenantId ?? (await tenantAtual())
  const { data, error } = await client
    .from("voto_assembleias_aptos")
    .select("id, nome_completo, assembleia_id, email_contato, telegram_chat_id, conflito_motivo")
    .eq("emp_proprietaria_id", emp)
    .eq("rod_assembleia_id", rodadaId)
    .is("aviso_contato_em", null)
    .is("hora_voto", null)
    .is("presenca_em", null)
    .or("email_contato.not.is.null,telegram_chat_id.not.is.null")
    .order("id")
    .limit(limite)
  // Sem as colunas (migração não aplicada): nada a fazer, sem erro.
  if (error) return error.code === "42703" ? { resultado: VAZIO } : { erro: `Falha ao ler os contatos: ${error.message}` }
  const linhas = (data ?? []) as (AptoComContato & { conflito_motivo: string | null })[]
  if (linhas.length === 0) return { resultado: VAZIO }

  const { dados, erro } = await dadosDoAviso(rodadaId, amb)
  if (!dados) return { erro }
  // Sem voto pela internet não há link pessoal a mandar.
  if (!dados.assembleiaOnlineId) return { resultado: VAZIO }

  const { gerarTokenAcesso } = await import("@/lib/acesso-eleitor")
  const origem = amb?.contexto.origem ?? (await origemAtual())
  const assunto = assuntoAvisoAptos(dados)
  const resultado: ResultadoLoteContato = { processados: linhas.length, enviados: 0, falhas: 0, restantes: 0 }
  const marcas: { id: string; canais: string | null; erro: string | null }[] = []

  const PARALELO = 6
  for (let i = 0; i < linhas.length; i += PARALELO) {
    const fatia = linhas.slice(i, i + PARALELO)
    const feitos = await Promise.all(
      fatia.map(async (a) => {
        // "Não sou eu": o link está desativado — não se manda nada.
        if (a.conflito_motivo === MARCA_NAO_RECONHECE) return { id: a.id, canais: null, erro: "nao_reconhece" }
        const assembleiaId = a.assembleia_id ?? (dados.assembleiaOnlineId as string)
        const t = encodeURIComponent(gerarTokenAcesso(a.id, assembleiaId))
        const base = `${origem}/votar/${assembleiaId}`
        const pessoal = `${base}/entrar?t=${t}`
        const canais: string[] = []
        if (a.email_contato) {
          const ok = await enviarEmail({
            email: a.email_contato,
            nome: a.nome_completo,
            assunto,
            html: montarEmailAvisoAptos(dados, {
              nome: a.nome_completo,
              email: a.email_contato,
              porta: "email",
              linkPessoal: pessoal,
              linkNaoSouEu: `${base}/nao-sou-eu?t=${t}`,
            }),
            contexto: amb?.contexto,
            cabecalhos: marcaEmailVoto(emp, "c", a.id),
          })
          if (ok) canais.push("email")
        }
        if (a.telegram_chat_id) {
          const ok = await enviarTelegram({
            chatId: a.telegram_chat_id,
            texto: mensagemTelegramAviso(dados, a.nome_completo),
            botoes: [[{ texto: "Ir para a votação", url: pessoal }]],
          })
          if (ok) canais.push("telegram")
        }
        return { id: a.id, canais: canais.length ? canais.join(",") : null, erro: canais.length ? null : "falha" }
      })
    )
    for (const f of feitos) {
      marcas.push(f)
      if (f.erro === "falha") resultado.falhas++
      else if (f.canais) resultado.enviados++
    }
  }

  // Client novo: o JWT do tenant vence em 60 s, e o lote pode passar disso.
  const gravar = amb?.client ?? (await createAdminClient())
  const agora = new Date().toISOString()
  const grupos = new Map<string, { ids: string[]; canais: string | null; erro: string | null }>()
  for (const m of marcas) {
    const chave = `${m.canais ?? ""}|${m.erro ?? ""}`
    const g = grupos.get(chave)
    if (g) g.ids.push(m.id)
    else grupos.set(chave, { ids: [m.id], canais: m.canais, erro: m.erro })
  }
  for (const g of grupos.values()) {
    await gravar
      .from("voto_assembleias_aptos")
      .update({ aviso_contato_em: agora, aviso_contato_canais: g.canais, aviso_contato_erro: g.erro })
      .eq("emp_proprietaria_id", emp)
      .in("id", g.ids)
  }
  resultado.restantes = await contarPendentes({ client: gravar, tenantId: emp }, rodadaId)
  return { resultado }
}

export type ResumoAvisoContato = {
  /** Aptos com e-mail pessoal ou Telegram confirmado no link geral. */
  comContato: number
  porEmail: number
  porTelegram: number
  avisados: number
  /** Ainda não votaram e esperam o aviso pelo contato. */
  pendentes: number
  falhas: number
}

/** Resumo do aviso ao contato na rodada (null = migração não aplicada). */
export async function resumoAvisoContato(rodadaId: string): Promise<ResumoAvisoContato | null> {
  const client = await createAdminClient()
  const emp = await tenantAtual()
  const base = () =>
    client
      .from("voto_assembleias_aptos")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("rod_assembleia_id", rodadaId)
  const sonda = await base().not("aviso_contato_canais", "is", null)
  if (sonda.error) return null
  const [comContato, porEmail, porTelegram, falhas, pendentes] = await Promise.all([
    base().or("email_contato.not.is.null,telegram_chat_id.not.is.null"),
    base().not("email_contato", "is", null),
    base().not("telegram_chat_id", "is", null),
    base().eq("aviso_contato_erro", "falha"),
    contarPendentes({ client, tenantId: emp }, rodadaId),
  ])
  return {
    comContato: comContato.count ?? 0,
    porEmail: porEmail.count ?? 0,
    porTelegram: porTelegram.count ?? 0,
    avisados: sonda.count ?? 0,
    pendentes,
    falhas: falhas.count ?? 0,
  }
}

/** Devolve à fila do contato quem ainda não votou (reenvio só pelos canais escolhidos). */
export async function reabrirAvisosContato(
  rodadaId: string,
  quais: "nao_votaram" | "falhas"
): Promise<{ erro?: string }> {
  const client = await createAdminClient()
  let q = client
    .from("voto_assembleias_aptos")
    .update({ aviso_contato_em: null, aviso_contato_canais: null, aviso_contato_erro: null })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("rod_assembleia_id", rodadaId)
    .not("aviso_contato_em", "is", null)
    .is("hora_voto", null)
  if (quais === "falhas") q = q.eq("aviso_contato_erro", "falha")
  const { error } = await q
  if (error && error.code !== "42703") return { erro: `Não foi possível reabrir: ${error.message}` }
  return {}
}
