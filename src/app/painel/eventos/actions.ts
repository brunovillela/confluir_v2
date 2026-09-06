"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import {
  avisarAvaliacao,
  avisarMudancaDoEvento,
  descreverAvisos,
  enviarRsvp,
} from "@/lib/db/eventos-emails"
import { type EstadoForm } from "@/lib/contas"
import { obterEvento, type SituacaoEvento } from "@/lib/db/eventos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Eventos — escrita da gestão.
 *
 * Criar e editar exige `eventos_gestao`. A recepção (`eventos_recepcao`) não
 * passa por aqui: ela só confirma presença, em ações próprias.
 */

const BASE = "/painel/eventos"
const MAX_CARD = 5 * 1024 * 1024
const TIPOS_CARD: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

function num(fd: FormData, campo: string): number | null {
  const v = txt(fd, campo)
  if (!v) return null
  const n = Number(v.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

function marcado(fd: FormData, campo: string): boolean {
  return fd.get(campo) === "on"
}

/** Texto → slug de URL: minúsculo, sem acento, hífens. */
function gerarSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/** Datas do período, uma por dia — a presença é registrada por dia. */
/**
 * Data de calendário BRASILEIRA (AAAA-MM-DD) de um instante.
 *
 * Não dá para usar UTC aqui: o servidor roda em UTC e uma reunião das 20h às
 * 22h atravessa a meia-noite lá, virando dois dias de evento — dois turnos de
 * recepção e um comparecimento diluído por dois. O dia do evento é o dia de
 * quem vai a ele.
 */
function dataLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso))
}

function diasEntre(inicioIso: string, terminoIso: string): string[] {
  const dias: string[] = []
  const [ai, mi, di] = dataLocal(inicioIso).split("-").map(Number)
  const limite = dataLocal(terminoIso)

  // O cursor anda em UTC apenas como aritmética de calendário — os extremos já
  // vieram convertidos para o fuso de São Paulo acima.
  const cursor = new Date(Date.UTC(ai, mi - 1, di))
  // Teto de 60 dias: evento maior que isso é erro de digitação, não congresso.
  while (dias.length < 60) {
    const dia = cursor.toISOString().slice(0, 10)
    dias.push(dia)
    if (dia >= limite) break
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dias
}

// ── Criar e editar ───────────────────────────────────────────────────────────

export async function salvarEvento(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("eventos_gestao")
  const id = txt(fd, "id")

  const titulo = txt(fd, "titulo")
  if (titulo.length < 3) return { erro: "Informe o título do evento." }

  const inicio = txt(fd, "inicio")
  const termino = txt(fd, "termino")
  if (!inicio || !termino) {
    return { erro: "Informe o início e o término do evento." }
  }
  if (new Date(termino) < new Date(inicio)) {
    return { erro: "O término não pode ser anterior ao início." }
  }

  const lotacao = num(fd, "lotacao_maxima")
  if (lotacao !== null && lotacao < 1) {
    return { erro: "A lotação máxima deve ser maior que zero." }
  }
  const overbooking = num(fd, "overbooking_percentual") ?? 0
  if (overbooking < 0 || overbooking > 100) {
    return { erro: "O overbooking deve ficar entre 0 e 100%." }
  }
  if (overbooking > 0 && lotacao === null) {
    return {
      erro: "Overbooking só faz sentido com lotação máxima definida — é sobre ela que o percentual incide.",
    }
  }

  const cota = num(fd, "cota_convidados")
  if (cota !== null && cota < 0) {
    return { erro: "A cota de convidados não pode ser negativa." }
  }
  if (cota !== null && cota > 0 && lotacao === null) {
    return {
      erro: "Guardar vagas para convidados exige lotação máxima definida — é dela que a reserva sai.",
    }
  }

  const abrem = txt(fd, "inscricoes_abrem_em")
  const fecham = txt(fd, "inscricoes_fecham_em")
  if (abrem && fecham && new Date(fecham) < new Date(abrem)) {
    return { erro: "O fim das inscrições não pode ser antes da abertura." }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // Card do evento (opcional) no bucket privado.
  let cardUrl: string | undefined
  const arquivo = fd.get("card")
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > MAX_CARD) {
      return { erro: "A imagem do card deve ter no máximo 5 MB." }
    }
    const extensao = TIPOS_CARD[arquivo.type]
    if (!extensao) return { erro: "O card deve ser JPG, PNG ou WebP." }
    const caminho = `cards/${Date.now()}.${extensao}`
    const { error: erroUpload } = await admin.storage
      .from("eventos")
      .upload(caminho, arquivo, { contentType: arquivo.type })
    if (erroUpload) {
      return { erro: `Falha ao subir o card: ${erroUpload.message}` }
    }
    cardUrl = caminho
  }

  const dados: Record<string, unknown> = {
    titulo,
    descricao: txt(fd, "descricao") || null,
    local: txt(fd, "local") || null,
    endereco: txt(fd, "endereco") || null,
    inicio: new Date(inicio).toISOString(),
    termino: new Date(termino).toISOString(),
    lotacao_maxima: lotacao,
    overbooking_percentual: overbooking,
    inscricoes_abrem_em: abrem ? new Date(abrem).toISOString() : null,
    inscricoes_fecham_em: fecham ? new Date(fecham).toISOString() : null,
    limite_inscricoes: num(fd, "limite_inscricoes"),
    cota_convidados: cota,
    exige_aprovacao: marcado(fd, "exige_aprovacao"),
    confirma_filiado_automatico: marcado(fd, "confirma_filiado_automatico"),
    exige_foto: marcado(fd, "exige_foto"),
    exige_rsvp: marcado(fd, "exige_rsvp"),
    updated_at: new Date().toISOString(),
  }
  if (cardUrl) dados.card_url = cardUrl

  let eventoId = id
  if (id) {
    const { error } = await admin
      .from("eventos")
      .update(dados)
      .eq("id", id)
      .eq("emp_proprietaria_id", emp)
    if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  } else {
    // Slug único por tenant: se colidir, sufixa com um número.
    const base = gerarSlug(titulo) || "evento"
    let slug = base
    for (let i = 2; i <= 20; i++) {
      const { data: existe } = await admin
        .from("eventos")
        .select("id")
        .eq("emp_proprietaria_id", emp)
        .eq("slug", slug)
        .maybeSingle()
      if (!existe) break
      slug = `${base}-${i}`
    }

    const { data: criado, error } = await admin
      .from("eventos")
      .insert({
        ...dados,
        slug,
        emp_proprietaria_id: emp,
        situacao: "rascunho",
        criado_por: sessao.usuario.id,
      })
      .select("id")
      .single()
    if (error || !criado) {
      return { erro: `Não foi possível criar: ${error?.message ?? "?"}` }
    }
    eventoId = criado.id as string
  }

  await sincronizarDias(eventoId, emp, inicio, termino)

  revalidatePath(BASE)
  revalidatePath(`${BASE}/${eventoId}`)
  redirect(`${BASE}/${eventoId}?salvo=1`)
}

/**
 * Mantém `eventos_dias` alinhado ao período. Acrescenta os dias que faltam e
 * remove os que saíram do intervalo — mas NUNCA um dia que já tem presença
 * registrada, porque isso apagaria o comparecimento de quem esteve lá.
 */
async function sincronizarDias(
  eventoId: string,
  emp: string,
  inicio: string,
  termino: string
): Promise<void> {
  const admin = await createAdminClient()
  const desejados = diasEntre(inicio, termino)

  const { data: atuais } = await admin
    .from("eventos_dias")
    .select("id, data")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", eventoId)
  const existentes = new Map(
    (atuais ?? []).map((d) => [d.data as string, d.id as string])
  )

  const novos = desejados
    .filter((d) => !existentes.has(d))
    .map((d) => ({
      emp_proprietaria_id: emp,
      evento_id: eventoId,
      data: d,
      ordem: desejados.indexOf(d) + 1,
    }))
  if (novos.length > 0) {
    await admin.from("eventos_dias").insert(novos)
  }

  const sobrando = [...existentes.entries()].filter(
    ([data]) => !desejados.includes(data)
  )
  for (const [, diaId] of sobrando) {
    const { count } = await admin
      .from("eventos_presencas")
      .select("id", { count: "exact", head: true })
      .eq("dia_id", diaId)
    if ((count ?? 0) === 0) {
      await admin.from("eventos_dias").delete().eq("id", diaId)
    }
  }
}

// ── Ciclo de vida ────────────────────────────────────────────────────────────

/**
 * Publicar, encerrar, adiar ou cancelar.
 *
 * Adiar e cancelar guardam o MOTIVO porque ele vai no e-mail aos inscritos —
 * "o evento foi adiado" sem explicação gera mais dúvida do que informação.
 */
export async function mudarSituacaoEvento(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("eventos_gestao")
  const id = txt(fd, "id")
  const nova = txt(fd, "situacao") as SituacaoEvento
  if (!id) return { erro: "Evento inválido." }

  const validas: SituacaoEvento[] = [
    "rascunho",
    "publicado",
    "encerrado",
    "adiado",
    "cancelado",
  ]
  if (!validas.includes(nova)) return { erro: "Situação inválida." }

  const evento = await obterEvento(id)
  if (!evento) return { erro: "Evento não encontrado." }

  const motivo = txt(fd, "motivo")
  if ((nova === "cancelado" || nova === "adiado") && !motivo) {
    return {
      erro: "Descreva o motivo — ele vai no aviso enviado a quem se inscreveu.",
    }
  }

  if (nova === "publicado") {
    if (!evento.titulo || !evento.inicio) {
      return { erro: "Complete título e período antes de publicar." }
    }
  }

  const adiadoPara = txt(fd, "adiado_para")

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("eventos")
    .update({
      situacao: nova,
      motivo_situacao: motivo || null,
      // Adiar SEM data é caso previsto: fica nulo e a tela diz "sem nova data".
      adiado_para:
        nova === "adiado" && adiadoPara
          ? new Date(adiadoPara).toISOString()
          : null,
      situacao_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível atualizar: ${error.message}` }

  revalidatePath(BASE)
  revalidatePath(`${BASE}/${id}`)

  // Cancelar e adiar avisam quem se inscreveu. O envio não pode desfazer a
  // mudança — mas o resultado vai na resposta: um aviso que não saiu em
  // silêncio é pior que um erro na tela.
  if (nova === "cancelado" || nova === "adiado") {
    const atualizado = await obterEvento(id)
    const avisos = atualizado
      ? await avisarMudancaDoEvento(atualizado, nova, motivo || null)
      : { enviados: 0, semEmail: 0, falharam: 0 }
    return {
      ok: `${nova === "cancelado" ? "Evento cancelado" : "Evento adiado"}. ${descreverAvisos(avisos)}`,
    }
  }

  return {
    ok:
      nova === "publicado"
        ? "Evento publicado — o link já está no ar."
        : "Situação atualizada.",
  }
}

// ── Avaliação de inscrições ──────────────────────────────────────────────────

export async function avaliarInscricao(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("eventos_gestao")
  const id = txt(fd, "inscricao_id")
  const decisao = txt(fd, "decisao")
  if (!id) return { erro: "Inscrição inválida." }
  if (!["confirmada", "recusada", "lista_espera"].includes(decisao)) {
    return { erro: "Decisão inválida." }
  }
  const motivo = txt(fd, "motivo")
  if (decisao === "recusada" && !motivo) {
    return { erro: "Descreva o motivo da recusa — ele vai no e-mail à pessoa." }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: insc } = await admin
    .from("eventos_inscricoes")
    .select("evento_id, situacao")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!insc) return { erro: "Inscrição não encontrada." }
  const jaEstava = insc.situacao === decisao

  const { error } = await admin
    .from("eventos_inscricoes")
    .update({
      situacao: decisao,
      motivo: motivo || null,
      avaliada_por: sessao.usuario.id,
      avaliada_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  revalidatePath(`${BASE}/${insc.evento_id as string}`)

  // Reavaliar para a MESMA situação não reenvia: apertar o botão duas vezes
  // não deve mandar dois e-mails iguais para a pessoa.
  if (jaEstava) return { ok: "Inscrição atualizada." }

  const evento = await obterEvento(insc.evento_id as string)
  if (!evento) return { ok: "Inscrição atualizada." }
  const avisos = await avisarAvaliacao(
    evento,
    id,
    decisao as "confirmada" | "recusada" | "lista_espera",
    motivo || null
  )
  return { ok: `Inscrição atualizada. ${descreverAvisos(avisos)}` }
}

/** Dispara o RSVP para os confirmados. */
export async function enviarRsvpAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("eventos_gestao")
  const id = txt(fd, "id")
  const evento = await obterEvento(id)
  if (!evento) return { erro: "Evento não encontrado." }
  if (!evento.exige_rsvp) {
    return { erro: "Este evento não pede RSVP — ligue a opção em Editar." }
  }

  const avisos = await enviarRsvp(evento, marcado(fd, "reenviar"))
  if (avisos.enviados === 0 && avisos.semEmail === 0 && avisos.falharam === 0) {
    return {
      ok: "Ninguém para perguntar: ou todos já responderam, ou ainda não há confirmados.",
    }
  }

  revalidatePath(`${BASE}/${id}`)
  return { ok: descreverAvisos(avisos) }
}
