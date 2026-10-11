import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import {
  capacidadeDoEvento,
  capacidadesDosEventos,
  inscricoesAbertas,
  obterConfig,
  obterEvento,
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
  /**
   * Inscrições ainda por abrir (A150): a data em que abrem, para a página
   * dizer "abrem em…" em vez de um "ainda não começaram" genérico.
   */
  inscricoesAbremEm: string | null
  /**
   * O evento pede foto e a entidade coleta foto (modo ≠ 'nenhuma') — sem ela
   * a inscrição não se completa na porta (A44). Mesma regra da página pública.
   */
  fotoObrigatoria: boolean
  /** A inscrição viva já tem a foto. */
  temFoto: boolean
  /** Já aconteceu (A135) — ver `eventoJaAconteceu`. */
  passado: boolean
}

/**
 * As datas que valem para o evento. Adiado com nova data: a nova, com a mesma
 * duração da original (o painel só guarda o novo início). Adiado sem nova
 * data: nenhuma — não há o que pôr no calendário nem como dizer que passou.
 */
export function periodoDoEvento(
  e: Pick<Evento, "situacao" | "inicio" | "termino" | "adiado_para">
): { inicio: string; termino: string | null } | null {
  if (e.situacao === "adiado") {
    if (!e.adiado_para) return null
    const duracao =
      e.inicio && e.termino ? new Date(e.termino).getTime() - new Date(e.inicio).getTime() : NaN
    return {
      inicio: e.adiado_para,
      termino:
        Number.isFinite(duracao) && duracao > 0
          ? new Date(new Date(e.adiado_para).getTime() + duracao).toISOString()
          : null,
    }
  }
  if (!e.inicio) return null
  return { inicio: e.inicio, termino: e.termino }
}

/**
 * O evento já aconteceu? Encerrado pela equipe, ou com a data (a nova, se
 * adiado) no passado: terminou — ou, sem término, já começou (A135). Não há
 * transição automática para 'encerrado', então a data é que manda.
 */
export function eventoJaAconteceu(
  e: Pick<Evento, "situacao" | "inicio" | "termino" | "adiado_para">,
  agora = new Date()
): boolean {
  if (e.situacao === "encerrado") return true
  const p = periodoDoEvento(e)
  if (!p) return false
  return new Date(p.termino ?? p.inicio) < agora
}

const JA_ACONTECEU = "Este evento já aconteceu."

/**
 * Eventos que interessam ao filiado: os publicados que ainda não terminaram,
 * mais aqueles em que ele já está inscrito (inclusive adiados — a inscrição
 * dele continua valendo e ele precisa acompanhar — e os que já passaram, que
 * a página mostra em "Eventos anteriores").
 */
export async function eventosParaFiliado(
  cpf: string,
  tenantId: string
): Promise<EventoDoFiliado[]> {
  const service = await createAdminClient()

  // Só o que ainda significa algo (A135): terminou de ontem para cá, sem
  // término começou de ontem para cá, ou foi adiado para uma data adiante.
  // A consulta tem um dia de folga; o corte exato, na hora, é o de
  // `eventoJaAconteceu`. Sem o filtro, os publicados antigos (ninguém os
  // passa a 'encerrado') ocupavam o teto em ordem crescente e empurravam os
  // eventos novos para fora da lista.
  const desde = deCampoDataHora(`${somarDiasISO(hojeSP(), -1)}T00:00`)
  const { data: brutos } = desde
    ? await service
        .from("eventos")
        .select("id")
        .eq("emp_proprietaria_id", tenantId)
        .in("situacao", ["publicado", "adiado"])
        .or(
          `termino.gte.${desde},and(termino.is.null,inicio.gte.${desde}),adiado_para.gte.${desde}`
        )
        .order("inicio", { ascending: true })
        .limit(200)
    : { data: [] }

  const ids = (brutos ?? []).map((e) => e.id as string)

  // As inscrições dele, mesmo em evento que saiu da lista acima.
  const [{ data: minhas }, { config }] = await Promise.all([
    service
      .from("eventos_inscricoes")
      .select(
        "id, evento_id, token, situacao, rsvp_confirmado, prontuario_presenca_em, foto_url"
      )
      .eq("emp_proprietaria_id", tenantId)
      .eq("cpf", cpf)
      .is("anonimizada_em", null),
    // Uma vez para a lista toda: o modo da foto é da entidade, não do evento.
    obterConfig().catch(() => ({ config: { modo_foto: "nenhuma" as const } })),
  ])

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

  // Duas consultas para a lista inteira, não duas por evento. A capacidade,
  // só dos que ainda vão acontecer: dos passados ninguém pergunta por vaga, e
  // quem foi a muitos eventos não precisa ler todas as inscrições deles.
  const agora = new Date()
  const eventos = await obterEventos(ids)
  const capacidades = await capacidadesDosEventos(
    eventos.filter((e) => !eventoJaAconteceu(e, agora))
  )

  const coletaFoto = config.modo_foto !== "nenhuma"
  const lista: EventoDoFiliado[] = []
  for (const evento of eventos) {
    const passado = eventoJaAconteceu(evento, agora)
    const capacidade = capacidades.get(evento.id)
    if (!passado && !capacidade) continue
    // Evento que já passou não está "aberto", mesmo sem data de fechamento
    // das inscrições: a função compartilhada só olha a janela de inscrição.
    const abertura =
      passado || !capacidade
        ? { aberta: false, motivo: JA_ACONTECEU }
        : inscricoesAbertas(evento, capacidade, agora)
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
        new Date(evento.rsvp_abre_em) <= agora,
      presencas: viva ? (contagem.get(viva.id as string) ?? 0) : 0,
      aberta: abertura.aberta,
      motivoFechada: abertura.motivo,
      vagasRestantes: capacidade?.publicasRestantes ?? null,
      inscricoesAbremEm:
        evento.situacao === "publicado" &&
        evento.inscricoes_abrem_em &&
        new Date(evento.inscricoes_abrem_em) > agora
          ? evento.inscricoes_abrem_em
          : null,
      fotoObrigatoria: coletaFoto && evento.exige_foto,
      temFoto: Boolean(viva?.foto_url),
      passado,
    })
  }

  // Por data — a que vale (a nova, se adiado); sem data, por último. A página
  // separa as seções; a lista só precisa vir em ordem.
  const quando = (e: EventoDoFiliado) => {
    const iso = periodoDoEvento(e.evento)?.inicio ?? e.evento.inicio
    return iso ? new Date(iso).getTime() : Number.MAX_SAFE_INTEGER
  }
  return lista.sort((a, b) => quando(a) - quando(b))
}

/**
 * Imagem do card dos eventos (A83), com URL assinada de uma hora — o bucket
 * `eventos` é privado. Uma chamada para a lista inteira, não uma por evento.
 */
export async function imagensDosEventos(eventos: Evento[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const comImagem = eventos.filter((e) => e.card_url)
  if (comImagem.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("eventos")
    .createSignedUrls([...new Set(comImagem.map((e) => e.card_url as string))], 3600)
  const porCaminho = new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
  for (const e of comImagem) {
    const url = porCaminho.get(e.card_url as string)
    if (url) mapa.set(e.id, url)
  }
  return mapa
}

/**
 * O evento para o "Adicionar ao calendário" (A84) — só se o filiado pode
 * vê-lo no portal: publicado ou adiado, ou com inscrição viva dele. Rascunho,
 * cancelado e adiado sem nova data não vão para o calendário.
 */
export async function eventoParaCalendario(
  eventoId: string,
  cpf: string,
  tenantId: string
): Promise<{
  evento: Evento
  periodo: { inicio: string; termino: string | null }
  inscricaoId: string | null
} | null> {
  const evento = await obterEvento(eventoId)
  if (!evento || evento.situacao === "rascunho" || evento.situacao === "cancelado") return null
  const service = await createAdminClient()
  const { data: insc } = await service
    .from("eventos_inscricoes")
    .select("id, situacao")
    .eq("emp_proprietaria_id", tenantId)
    .eq("evento_id", eventoId)
    .eq("cpf", cpf)
    .is("anonimizada_em", null)
    .maybeSingle()
  const viva = insc && insc.situacao !== "cancelada" && insc.situacao !== "recusada" ? insc : null
  if (!viva && evento.situacao !== "publicado" && evento.situacao !== "adiado") return null
  const periodo = periodoDoEvento(evento)
  if (!periodo) return null
  return { evento, periodo, inscricaoId: (viva?.id as string) ?? null }
}

/**
 * A inscrição deste token é do filiado? A página pública do código só oferece
 * o "Voltar ao portal" ao dono dela (A45) — não a quem apenas tem o portal
 * aberto no mesmo aparelho, nem à gestão em "Ver como filiado" abrindo a
 * inscrição de outra pessoa pelo painel.
 */
export async function inscricaoEhDoFiliado(
  token: string,
  cpf: string,
  tenantId: string
): Promise<boolean> {
  const service = await createAdminClient()
  const { data } = await service
    .from("eventos_inscricoes")
    .select("cpf")
    .eq("emp_proprietaria_id", tenantId)
    .eq("token", token)
    .maybeSingle()
  return Boolean(data?.cpf) && data?.cpf === cpf
}

export type ItemAgendaCalendario = {
  id: string
  atividade: string | null
  local: string | null
  inicio: string
  termino: string | null
  diaTodo: boolean
  tipo: string | null
  informacoes: string | null
}

/** Compromisso da agenda do portal (A84) — só os marcados para o aplicativo. */
export async function itemDaAgendaParaCalendario(
  id: string,
  tenantId: string
): Promise<ItemAgendaCalendario | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("agenda")
    .select("id, atividade, local, inicio, termino, dia_todo, tipo, informacoes_gerais")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", id)
    .eq("aplicativo", true)
    .maybeSingle()
  if (!data || !texto(data.inicio)) return null
  return {
    id: String(data.id),
    atividade: texto(data.atividade),
    local: texto(data.local),
    inicio: String(data.inicio),
    termino: texto(data.termino),
    diaTodo: data.dia_todo === true,
    tipo: texto(data.tipo),
    informacoes: texto(data.informacoes_gerais),
  }
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
  // Evento que já passou fecha mesmo sem data de fechamento das inscrições.
  if (eventoJaAconteceu(evento)) return { erro: JA_ACONTECEU }
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
 * Vale para a confirmada e também para a que espera avaliação ou está na
 * lista de espera (A81): quem desiste sai da fila. `situacaoAnterior` deixa a
 * action escolher a frase certa.
 */
export async function cancelarInscricaoDoFiliado(
  inscricaoId: string,
  cpf: string,
  tenantId: string
): Promise<{ erro?: string; situacaoAnterior?: string }> {
  const service = await createAdminClient()
  const { data: insc } = await service
    .from("eventos_inscricoes")
    .select("id, cpf, situacao, evento_id")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", inscricaoId)
    .maybeSingle()
  if (!insc || insc.cpf !== cpf) return { erro: "Inscrição não encontrada." }
  if (insc.situacao === "cancelada") return { situacaoAnterior: "cancelada" }
  // Como cancelada reabre a inscrição, cancelar uma recusada seria o atalho
  // para desfazer a decisão da entidade.
  if (insc.situacao === "recusada") {
    return { erro: "Esta inscrição não foi aprovada — não há o que cancelar." }
  }
  // Depois do evento não há vaga a liberar; a inscrição fica como registro.
  const evento = await obterEvento(insc.evento_id as string)
  if (evento && eventoJaAconteceu(evento)) return { erro: JA_ACONTECEU }

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
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", inscricaoId)
  if (error) return { erro: "Não foi possível cancelar." }
  return { situacaoAnterior: insc.situacao as string }
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
