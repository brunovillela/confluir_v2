import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import {
  capacidadeDoEvento,
  capacidadesDosEventos,
  inscricoesAbertas,
  obterEventos,
  type Evento,
  type SituacaoInscricao,
} from "@/lib/db/eventos"
import { registrarInscricaoNoProntuario } from "@/lib/db/eventos-filiados"
import { ZERAR_AO_REINSCREVER } from "@/lib/db/eventos-publico"
import { avisarFiliado, type AvisoPortal } from "@/lib/db/portal-avisos"
import { type ContextoEmail } from "@/lib/email"
import { botaoEmail, escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { deCampoDataHora } from "@/lib/formato"
import { somarDiasISO } from "@/lib/periodo-dias"
import { createAdminClient } from "@/lib/supabase/admin"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Eventos na área do filiado.
 *
 * O filiado já está identificado — nome, CPF e e-mail vêm da filiação. Então o
 * caminho dele é bem mais curto que o do público: um clique e pronto, sem
 * formulário e SEM código de confirmação por e-mail, porque não há e-mail a
 * confirmar: quem entrou no portal já provou quem é.
 *
 * SQL: supabase/eventos-filiados-agenda.sql
 */

export type EventoDoFiliado = {
  evento: Evento
  /**
   * Tem inscrição VIVA — qualquer situação menos 'cancelada'. Quem cancelou
   * volta a ser só um interessado: o evento reaparece em "Inscrições abertas"
   * (se ainda houver) com o botão de sempre. 'recusada' continua contando:
   * foi decisão da entidade e não reabre.
   */
  inscrito: boolean
  /** Id e token só de inscrição viva. */
  inscricaoId: string | null
  inscricaoToken: string | null
  /** Situação da linha, mesmo cancelada (a página avisa que dá para voltar). */
  situacao: string | null
  rsvpConfirmado: boolean | null
  rsvpAberto: boolean
  presencas: number
  aberta: boolean
  motivoFechada?: string
  vagasRestantes: number | null
}

/**
 * Eventos que interessam ao filiado: os publicados que ainda não terminaram,
 * mais aqueles em que ele já está inscrito (inclusive adiados — a inscrição
 * dele continua valendo e ele precisa acompanhar).
 */
export async function eventosParaFiliado(
  cpf: string,
  tenantId: string
): Promise<EventoDoFiliado[]> {
  const service = await createAdminClient()

  const { data: brutos } = await service
    .from("eventos")
    .select("id")
    .eq("emp_proprietaria_id", tenantId)
    .in("situacao", ["publicado", "adiado"])
    .order("inicio", { ascending: true })
    .limit(50)

  const ids = (brutos ?? []).map((e) => e.id as string)

  // As inscrições dele, mesmo em evento que saiu da lista acima.
  const { data: minhas } = await service
    .from("eventos_inscricoes")
    .select(
      "id, evento_id, token, situacao, rsvp_confirmado, prontuario_presenca_em"
    )
    .eq("emp_proprietaria_id", tenantId)
    .eq("cpf", cpf)
    .is("anonimizada_em", null)

  const porEvento = new Map(
    (minhas ?? []).map((i) => [i.evento_id as string, i])
  )
  // Inscrição cancelada não puxa evento que já saiu da lista (encerrado,
  // cancelado): não há o que acompanhar nem como voltar.
  for (const [id, i] of porEvento) {
    if (i.situacao === "cancelada") continue
    if (!ids.includes(id)) ids.push(id)
  }
  if (ids.length === 0) return []

  // Presenças, para mostrar "você compareceu".
  const { data: presencas } = await service
    .from("eventos_presencas")
    .select("inscricao_id")
    .in(
      "inscricao_id",
      (minhas ?? []).map((i) => i.id as string)
    )
  const contagem = new Map<string, number>()
  for (const p of presencas ?? []) {
    const id = p.inscricao_id as string
    contagem.set(id, (contagem.get(id) ?? 0) + 1)
  }

  // Duas consultas para a lista inteira, não duas por evento.
  const eventos = await obterEventos(ids)
  const capacidades = await capacidadesDosEventos(eventos)

  const lista: EventoDoFiliado[] = []
  for (const evento of eventos) {
    const capacidade = capacidades.get(evento.id)
    if (!capacidade) continue
    const abertura = inscricoesAbertas(evento, capacidade)
    const minha = porEvento.get(evento.id)
    const viva = minha && minha.situacao !== "cancelada" ? minha : undefined

    lista.push({
      evento,
      inscrito: Boolean(viva),
      inscricaoId: (viva?.id as string) ?? null,
      inscricaoToken: (viva?.token as string) ?? null,
      situacao: (minha?.situacao as string) ?? null,
      rsvpConfirmado: (viva?.rsvp_confirmado as boolean | null) ?? null,
      rsvpAberto:
        evento.rsvp_abre_em !== null &&
        new Date(evento.rsvp_abre_em) <= new Date(),
      presencas: viva ? (contagem.get(viva.id as string) ?? 0) : 0,
      aberta: abertura.aberta,
      motivoFechada: abertura.motivo,
      vagasRestantes: capacidade.publicasRestantes,
    })
  }

  // Quem já está inscrito primeiro; depois por data.
  return lista.sort((a, b) => {
    if (a.inscrito !== b.inscrito) return a.inscrito ? -1 : 1
    return (a.evento.inicio ?? "").localeCompare(b.evento.inicio ?? "")
  })
}

/**
 * Inscreve o filiado. Sem código por e-mail: a sessão do portal já é a prova
 * de identidade, e mandar a pessoa confirmar um e-mail que ela usou para
 * entrar seria burocracia sem ganho.
 *
 * Quem cancelou e voltou reaproveita a mesma linha (um CPF, uma inscrição por
 * evento), com as mesmas travas e efeitos de uma inscrição nova. `jaInscrito`
 * avisa que nada foi gravado — a action não pode dizer "Inscrição feita.".
 */
export async function inscreverFiliado(
  evento: Evento,
  filiado: { cpf: string; nome: string | null; email: string | null; filiacaoId: string },
  tenantId: string
): Promise<{
  erro?: string
  token?: string
  /** Id da inscrição gravada agora (o recibo no sino aponta para ela). */
  inscricaoId?: string
  situacao?: SituacaoInscricao
  jaInscrito?: boolean
  reinscricao?: boolean
}> {
  const service = await createAdminClient()
  const { data: existente } = await service
    .from("eventos_inscricoes")
    .select("id, token, situacao, reservada_por")
    .eq("emp_proprietaria_id", tenantId)
    .eq("evento_id", evento.id)
    .eq("cpf", filiado.cpf)
    .maybeSingle()

  // Recusa foi decisão da entidade: não se desfaz com um clique.
  if (existente?.situacao === "recusada") {
    return {
      erro: "Sua inscrição anterior neste evento não foi aprovada. Se tiver dúvidas, fale com o sindicato.",
    }
  }
  // Inscrição viva: nada a gravar, só o endereço dela.
  if (existente && existente.situacao !== "cancelada") {
    return { token: existente.token as string, jaInscrito: true }
  }

  // Nova ou de volta depois de cancelar: as mesmas travas, com as vagas
  // contadas AGORA — a de quem cancelou pode ter sido ocupada nesse meio-tempo.
  const capacidade = await capacidadeDoEvento(evento)
  const abertura = inscricoesAbertas(evento, capacidade)
  if (!abertura.aberta) {
    return { erro: abertura.motivo ?? "As inscrições estão fechadas." }
  }

  // Filiado entra CONFIRMADO quando o evento assim permite; senão espera
  // avaliação como qualquer um.
  const situacao: SituacaoInscricao =
    evento.exige_aprovacao && !evento.confirma_filiado_automatico
      ? "pendente"
      : "confirmada"

  const agora = new Date().toISOString()

  if (existente) {
    const { data: reaberta, error } = await service
      .from("eventos_inscricoes")
      .update({
        ...ZERAR_AO_REINSCREVER,
        // Convidado continua convidado de quem o trouxe; o resto passa a ter
        // vindo pelo portal, como a inscrição nova.
        ...(existente.reservada_por ? {} : { origem: "portal" }),
        situacao,
        // Dado ausente na filiação não apaga o que a inscrição já tinha.
        nome: filiado.nome ?? undefined,
        email: filiado.email ?? undefined,
        filiacao_id: filiado.filiacaoId,
        email_confirmado_em: agora,
        // O aceite agora é o do portal, como na inscrição nova: o termo e o IP
        // de um formulário público anterior não acompanham a data nova. O
        // termo da foto fica — a foto, se houver, continua na inscrição.
        consentimento_em: agora,
        termo_id: null,
        consentimento_ip: null,
        codigo_hash: null,
        updated_at: agora,
      })
      .eq("emp_proprietaria_id", tenantId)
      .eq("id", existente.id as string)
      // Só se continuar cancelada: dois cliques não se atropelam.
      .eq("situacao", "cancelada")
      .select("id, token")
      .maybeSingle()
    if (error) {
      return {
        erro: "Não foi possível refazer a inscrição. Recarregue a página e tente de novo.",
      }
    }
    // Nenhuma linha: outro envio simultâneo já a reabriu — nada foi gravado aqui.
    if (!reaberta) return { jaInscrito: true }
    await registrarInscricaoNoProntuario(reaberta.id as string, tenantId)
    return { token: reaberta.token as string, inscricaoId: reaberta.id as string, situacao, reinscricao: true }
  }

  const { data: criada, error } = await service
    .from("eventos_inscricoes")
    .insert({
      emp_proprietaria_id: tenantId,
      evento_id: evento.id,
      nome: filiado.nome,
      cpf: filiado.cpf,
      email: filiado.email,
      filiacao_id: filiado.filiacaoId,
      origem: "portal",
      situacao,
      // Entrou pela área logada: o e-mail já está provado.
      email_confirmado_em: agora,
      consentimento_em: agora,
    })
    .select("id, token")
    .single()
  // Índice único (evento, CPF): outro envio simultâneo inscreveu primeiro.
  if (error?.code === "23505") return { jaInscrito: true }
  if (error || !criada) {
    return { erro: "Não foi possível concluir a inscrição. Tente de novo em instantes." }
  }

  await registrarInscricaoNoProntuario(criada.id as string, tenantId)
  return { token: criada.token as string, inscricaoId: criada.id as string, situacao }
}

/**
 * Cancela a própria inscrição — desistir é direito de quem se inscreveu, e
 * voltar também: cancelada reabre o evento para a pessoa (inscreverFiliado).
 */
export async function cancelarInscricaoDoFiliado(
  inscricaoId: string,
  cpf: string,
  tenantId: string
): Promise<{ erro?: string }> {
  const service = await createAdminClient()
  const { data: insc } = await service
    .from("eventos_inscricoes")
    .select("id, cpf, situacao")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", inscricaoId)
    .maybeSingle()
  if (!insc || insc.cpf !== cpf) return { erro: "Inscrição não encontrada." }
  if (insc.situacao === "cancelada") return {}
  // Como cancelada reabre a inscrição, cancelar uma recusada seria o atalho
  // para desfazer a decisão da entidade.
  if (insc.situacao === "recusada") {
    return { erro: "Esta inscrição não foi aprovada — não há o que cancelar." }
  }

  const { count } = await service
    .from("eventos_presencas")
    .select("id", { count: "exact", head: true })
    .eq("inscricao_id", inscricaoId)
  if ((count ?? 0) > 0) {
    return { erro: "Você já teve presença registrada neste evento." }
  }

  const { error } = await service
    .from("eventos_inscricoes")
    .update({ situacao: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", inscricaoId)
  if (error) return { erro: "Não foi possível cancelar." }
  return {}
}

// ── Avisos ao filiado (A122) ─────────────────────────────────────────────────

const PREFERENCIAS_PORTAL =
  "Você pode escolher quais avisos recebe por e-mail em Portal → Avisos → Preferências."

/**
 * Endereço do aviso: a inscrição na página de eventos do portal (o aviso leva
 * ao item, não à lista). O id na âncora também separa um aviso do outro no
 * `umaVez`, que compara texto e link.
 */
export function linkDaInscricaoNoPortal(inscricaoId: string): string {
  return `/portal/eventos#inscricao-${inscricaoId}`
}

/** "11/10/2026" e "19:00" no fuso de São Paulo. */
function diaEHora(iso: string): { dia: string; hora: string } {
  const d = new Date(iso)
  const fuso = { timeZone: "America/Sao_Paulo" } as const
  return {
    dia: new Intl.DateTimeFormat("pt-BR", { ...fuso, day: "2-digit", month: "2-digit", year: "numeric" }).format(d),
    hora: new Intl.DateTimeFormat("pt-BR", { ...fuso, hour: "2-digit", minute: "2-digit" }).format(d),
  }
}

/** Data, hora, local e endereço do evento, no miolo do e-mail. */
function blocoDoEvento(e: { titulo: string | null; inicio: string | null; local: string | null; endereco: string | null }): string {
  const quando = e.inicio ? diaEHora(e.inicio) : null
  const linhas = [
    `<strong>${escaparHtml(e.titulo ?? "Evento")}</strong>`,
    quando ? `${quando.dia} às ${quando.hora}` : "",
    escaparHtml(e.local ?? ""),
    escaparHtml(e.endereco ?? ""),
  ].filter(Boolean)
  return paragrafo(linhas.join("<br>"))
}

/**
 * Recibo da inscrição feita pelo portal (A122): o que foi feito, a data do
 * evento e o link para a inscrição. Confirmada → sino + e-mail conforme a
 * preferência "Eventos", com o botão do código de entrada (é o que se usa na
 * porta). Pendente → só o sino: o e-mail sai quando a entidade avaliar
 * (`avisarAvaliacao`), e dois e-mails sobre a mesma inscrição seriam ruído.
 * Sem `umaVez`: voltar depois de cancelar é uma inscrição nova, com recibo
 * novo; o clique repetido já não chega aqui (`jaInscrito`).
 */
export async function avisarReciboInscricao(
  evento: Evento,
  inscricao: { id: string; token: string | null; situacao: SituacaoInscricao },
  filiado: { cpf: string; nome: string | null; email: string | null }
): Promise<void> {
  const titulo = evento.titulo ?? "evento"
  const quando = evento.inicio ? diaEHora(evento.inicio) : null
  const sufixo = quando ? ` — ${quando.dia} às ${quando.hora}` : ""
  const link = linkDaInscricaoNoPortal(inscricao.id)
  const base = { cpf: filiado.cpf, nome: filiado.nome, email: filiado.email, evento: "eventos" as const, link }

  if (inscricao.situacao !== "confirmada") {
    await avisarFiliado({ ...base, soSino: true, texto: `Inscrição recebida, aguardando avaliação: ${titulo}${sufixo}.` })
    return
  }

  const origem = await origemAtual().catch(() => "")
  await avisarFiliado({
    ...base,
    assunto: `Inscrição confirmada — ${titulo}`,
    texto: `Inscrição confirmada: ${titulo}${sufixo}.`,
    html:
      tituloEmail("Inscrição confirmada") +
      paragrafo(`Sua inscrição em <strong>${escaparHtml(titulo)}</strong> está confirmada.`) +
      blocoDoEvento(evento) +
      (origem && inscricao.token ? botaoEmail(`${origem}/inscricao/${inscricao.token}`, "Ver meu código de entrada") : "") +
      textoSuave(
        "Na entrada, tenha à mão o código de entrada e um documento com foto. Se não puder ir, cancele a inscrição no portal para liberar a vaga."
      ) +
      textoSuave(PREFERENCIAS_PORTAL),
  })
}

export type ResultadoVesperaEventos = {
  /** Eventos de amanhã com hora e local. */
  eventos: number
  /** Inscrições confirmadas de filiados nesses eventos. */
  inscricoes: number
  avisados: number
  porEmail: number
  /** Já tinham o lembrete desta inscrição para esta data. */
  jaAvisados: number
  /** Disseram que não vêm (RSVP) ou sem CPF válido. */
  pulados: number
  falhas: number
  erro?: string
}

/**
 * Lembrete na VÉSPERA (A122), para o tick diário — roda FORA de requisição:
 * passe o service client, o tenant da volta do laço e o contexto do e-mail
 * (`contextoDoTenant`), como nos outros lembretes; nada aqui lê o tenant ou a
 * origem da requisição (achado A19).
 *
 * Véspera = o evento começa AMANHÃ no calendário de São Paulo, seja qual for
 * a hora do tick. Só eventos publicados com hora e local (adiado não: a data
 * ainda é a antiga). Vai às inscrições confirmadas de filiados — o sino é o
 * deles, e é ele que guarda o "uma vez" — menos a de quem já respondeu que não
 * vem. Uma vez por inscrição: o texto leva a data e o link leva a inscrição,
 * e o `umaVez` não repete; se o evento mudar de dia, o lembrete da data nova
 * sai. O e-mail respeita a preferência "Eventos" e leva o código de entrada.
 * Inscrição de não filiado fica de fora: sem sino, não haveria onde guardar o
 * "já avisado" (precisaria de uma coluna em eventos_inscricoes).
 */
export async function lembretesVesperaEventos(amb: {
  client: SupabaseClient
  tenantId: string
  contexto: ContextoEmail
}): Promise<ResultadoVesperaEventos> {
  const { client, tenantId, contexto } = amb
  const vazio: ResultadoVesperaEventos = {
    eventos: 0,
    inscricoes: 0,
    avisados: 0,
    porEmail: 0,
    jaAvisados: 0,
    pulados: 0,
    falhas: 0,
  }
  const amanha = somarDiasISO(hojeSP(), 1)
  const de = deCampoDataHora(`${amanha}T00:00`)
  const ate = deCampoDataHora(`${somarDiasISO(amanha, 1)}T00:00`)
  if (!de || !ate) return vazio

  const { data: brutos, error } = await client
    .from("eventos")
    .select("id, titulo, inicio, local, endereco")
    .eq("emp_proprietaria_id", tenantId)
    .eq("situacao", "publicado")
    .gte("inicio", de)
    .lt("inicio", ate)
  if (error) return { ...vazio, erro: esquemaAusente(error) ? "sem tabela de eventos" : error.message }
  const eventos = new Map(
    (brutos ?? [])
      .filter((e) => texto(e.inicio) && (texto(e.local) ?? texto(e.endereco)))
      .map((e) => [
        String(e.id),
        {
          titulo: texto(e.titulo),
          inicio: String(e.inicio),
          local: texto(e.local),
          endereco: texto(e.endereco),
        },
      ])
  )
  if (eventos.size === 0) return vazio

  let inscricoes: Record<string, unknown>[]
  try {
    inscricoes = await lerEmLotes((ini, fim) =>
      client
        .from("eventos_inscricoes")
        .select("id, evento_id, cpf, nome, email, token, rsvp_confirmado")
        .eq("emp_proprietaria_id", tenantId)
        .in("evento_id", [...eventos.keys()])
        .eq("situacao", "confirmada")
        .is("anonimizada_em", null)
        .not("filiacao_id", "is", null)
        .order("id")
        .range(ini, fim)
    )
  } catch (e) {
    return { ...vazio, eventos: eventos.size, erro: (e as Error).message }
  }

  const resultado: ResultadoVesperaEventos = { ...vazio, eventos: eventos.size, inscricoes: inscricoes.length }
  const lembretes: { cpf: string; aviso: AvisoPortal }[] = []
  for (const i of inscricoes) {
    const ev = eventos.get(String(i.evento_id))
    const cpf = cpfConfiavel(i.cpf as string | null)
    if (!ev || !cpf || i.rsvp_confirmado === false) {
      resultado.pulados++
      continue
    }
    const { dia, hora } = diaEHora(ev.inicio)
    const titulo = ev.titulo ?? "evento"
    const onde = ev.local ?? ev.endereco ?? ""
    const nome = texto(i.nome)
    const primeiro = nome?.trim().split(/\s+/)[0]
    const token = texto(i.token)
    lembretes.push({
      cpf,
      aviso: {
        cpf,
        nome,
        email: texto(i.email)?.trim() ?? null,
        evento: "eventos",
        umaVez: true,
        link: linkDaInscricaoNoPortal(String(i.id)),
        assunto: `Amanhã: ${titulo}`,
        texto: `Amanhã, ${dia} às ${hora}: ${titulo} — ${onde}.`,
        html:
          tituloEmail(`Amanhã: ${escaparHtml(titulo)}`) +
          paragrafo(`${primeiro ? `Olá, ${escaparHtml(primeiro)}!` : "Olá!"} Lembrete da sua inscrição confirmada:`) +
          blocoDoEvento(ev) +
          (token ? botaoEmail(`${contexto.origem}/inscricao/${token}`, "Ver meu código de entrada") : "") +
          textoSuave("Se não puder ir, cancele a inscrição no portal para liberar a vaga para quem está na fila.") +
          textoSuave(PREFERENCIAS_PORTAL),
      },
    })
  }

  // O que já foi lembrado: a leitura separa "já avisado" de falha no relatório
  // do tick; o `umaVez` barra a repetição mesmo sem ela. Só os lembretes: o
  // mesmo link tem recibo, RSVP e avaliação, e 200 links × vários avisos
  // passariam do teto de 1.000 linhas.
  const ja = new Set<string>()
  const links = lembretes.map((l) => l.aviso.link)
  for (let i = 0; i < links.length; i += 200) {
    const { data } = await client
      .from("portal_avisos")
      .select("cpf, texto, link")
      .eq("emp_proprietaria_id", tenantId)
      .eq("evento", "eventos")
      .like("texto", "Amanhã, %")
      .in("link", links.slice(i, i + 200))
    for (const a of data ?? []) ja.add(`${a.cpf}|${a.texto}|${a.link}`)
  }
  const novos = lembretes.filter((l) => {
    const repetido = ja.has(`${l.cpf}|${l.aviso.texto}|${l.aviso.link}`)
    if (repetido) resultado.jaAvisados++
    return !repetido
  })

  // Cinco por vez: sequencial demora num evento grande; tudo junto estoura o provedor.
  for (let i = 0; i < novos.length; i += 5) {
    const saidas = await Promise.all(
      novos.slice(i, i + 5).map((l) => avisarFiliado(l.aviso, { client, tenantId, contexto }))
    )
    for (const r of saidas) {
      if (r) resultado.avisados++
      else resultado.falhas++
      if (r === "email") resultado.porEmail++
    }
  }
  return resultado
}
