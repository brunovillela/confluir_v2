import "server-only"

import { esquemaAusente, hojeSP, lerEmLotes, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarEmail } from "@/lib/email"
import { botaoEmail, caixaAviso, escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import {
  conferirAvaliacao,
  DIAS_LEMBRETE,
  INICIO_AVALIACOES,
  NOTA_EXIGE_COMENTARIO,
  ROTULO_NOTA,
} from "@/lib/hospedagem-avaliacoes-constantes"
import { createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Avaliação da hospedagem — `hospedagem_avaliacoes` (supabase/hospedagem-
 * avaliacoes.sql). Regras puras e indicadores em lib/hospedagem-avaliacoes-
 * constantes.ts.
 *
 * Tudo aqui recebe a ENTIDADE explícita e usa o service role com filtro por
 * ela: as mesmas funções servem à requisição (portal, painel, hotel, link sem
 * senha) e ao tick diário, que roda sem host de tenant.
 */

export const AVISO_SQL_AVALIACOES =
  "Rode supabase/hospedagem-avaliacoes.sql no Supabase para ativar a avaliação da hospedagem."

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Antes de olhar estadias, quantos dias para trás do início ler cupons. */
const JANELA_CHECKIN_DIAS = 60

function diasAntes(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

// ── Pendências: quem precisa avaliar ─────────────────────────────────────────

/**
 * Abre a pendência de toda estadia CONCLUÍDA ainda sem avaliação: o hotel
 * marcou presença (compareceu; na demanda garantida, presenca_em) e o
 * check-out já passou. Só estadias com check-out a partir do lançamento.
 * `filiadoIds` restringe à pessoa (o portal chama antes de conferir a trava).
 */
export async function gerarPendencias(
  empId: string,
  opcoes: { filiadoIds?: string[] } = {}
): Promise<{ criadas: number; erro?: string }> {
  const svc = createServiceClient()
  const hoje = hojeSP()
  const { data: hoteis } = await svc.from("hospedagem_hotel").select("id").eq("emp_proprietaria_id", empId)
  const hotelIds = (hoteis ?? []).map((h) => String(h.id))
  if (!hotelIds.length) return { criadas: 0 }
  if (opcoes.filiadoIds && !opcoes.filiadoIds.length) return { criadas: 0 }

  const desde = diasAntes(INICIO_AVALIACOES, JANELA_CHECKIN_DIAS)
  let cupons: Record<string, unknown>[]
  try {
    cupons = await lerEmLotes((de, ate) => {
      let q = svc
        .from("hospedagem_cupom")
        .select("id, hotel_id, filiado_id, check_in, check_out, reserva_garantida, compareceu, presenca_em, cancelado, servico_id")
        .in("hotel_id", hotelIds)
        .gte("check_in", desde)
        .not("cancelado", "is", true)
      if (opcoes.filiadoIds) q = q.in("filiado_id", opcoes.filiadoIds)
      return q.order("id").range(de, ate)
    })
  } catch (e) {
    return { criadas: 0, erro: (e as Error).message }
  }
  const usados = cupons.filter((c) => (c.reserva_garantida === true ? Boolean(c.presenca_em) : c.compareceu === true))
  if (!usados.length) return { criadas: 0 }

  // Check-out: a reserva garantida tem o dela; o cupom comum, o do serviço.
  const servicoIds = [...new Set(usados.map((c) => texto(c.servico_id)).filter((v): v is string => !!v))]
  const checkoutServico = new Map<string, string>()
  for (let i = 0; i < servicoIds.length; i += 200) {
    const { data } = await svc
      .from("hospedagem_servico")
      .select("id, checkout_date")
      .in("id", servicoIds.slice(i, i + 200))
    for (const s of data ?? []) if (s.checkout_date) checkoutServico.set(String(s.id), String(s.checkout_date).slice(0, 10))
  }
  const candidatos = usados
    .map((c) => ({
      c,
      checkOut:
        c.reserva_garantida === true
          ? texto(c.check_out)?.slice(0, 10) ?? null
          : c.servico_id
            ? (checkoutServico.get(String(c.servico_id)) ?? null)
            : null,
    }))
    .filter((x): x is { c: Record<string, unknown>; checkOut: string } =>
      !!x.checkOut && x.checkOut >= INICIO_AVALIACOES && x.checkOut < hoje
    )
  if (!candidatos.length) return { criadas: 0 }

  const ja = new Set<string>()
  const ids = candidatos.map((x) => String(x.c.id))
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await svc.from("hospedagem_avaliacoes").select("cupom_id").in("cupom_id", ids.slice(i, i + 200))
    if (error) return { criadas: 0, erro: esquemaAusente(error) ? AVISO_SQL_AVALIACOES : error.message }
    for (const a of data ?? []) ja.add(String(a.cupom_id))
  }
  const novas = candidatos
    .filter((x) => !ja.has(String(x.c.id)))
    .map((x) => ({
      emp_proprietaria_id: empId,
      cupom_id: String(x.c.id),
      hotel_id: String(x.c.hotel_id),
      filiado_id: texto(x.c.filiado_id),
      check_in: texto(x.c.check_in)?.slice(0, 10) ?? null,
      check_out: x.checkOut,
    }))
  if (!novas.length) return { criadas: 0 }
  // upsert ignorando duplicata: o tick e o portal podem correr juntos.
  const { error } = await svc.from("hospedagem_avaliacoes").upsert(novas, { onConflict: "cupom_id", ignoreDuplicates: true })
  if (error) return { criadas: 0, erro: error.message }
  return { criadas: novas.length }
}

export type PendenciaAvaliacao = {
  token: string
  hotelNome: string | null
  checkIn: string | null
  checkOut: string
}

/** Avaliações pendentes da pessoa (todos os registros do CPF). */
export async function pendenciasDaPessoa(registros: string[]): Promise<PendenciaAvaliacao[]> {
  if (!registros.length) return []
  const empId = await tenantAtual()
  await gerarPendencias(empId, { filiadoIds: registros })
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("hospedagem_avaliacoes")
    .select("token, hotel_id, check_in, check_out")
    .eq("emp_proprietaria_id", empId)
    .eq("situacao", "pendente")
    .in("filiado_id", registros)
    .order("check_out")
  if (error || !data?.length) return []
  const nomes = await nomesDeHoteis(data.map((a) => String(a.hotel_id)))
  return data.map((a) => ({
    token: String(a.token),
    hotelNome: nomes.get(String(a.hotel_id)) ?? null,
    checkIn: texto(a.check_in),
    checkOut: String(a.check_out),
  }))
}

/** Trava do portal: mensagem quando há avaliação pendente, ou null. */
export async function travaPorAvaliacao(registros: string[]): Promise<string | null> {
  const pend = await pendenciasDaPessoa(registros)
  if (!pend.length) return null
  const p = pend[0]
  return `Antes de um novo pedido, avalie sua hospedagem${p.hotelNome ? ` no ${p.hotelNome}` : ""} — leva menos de um minuto, no cartão "Avalie sua hospedagem" desta página.`
}

async function nomesDeHoteis(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)]
  if (!unicos.length) return new Map()
  const svc = createServiceClient()
  const { data } = await svc.from("hospedagem_hotel").select("id, nome").in("id", unicos)
  return new Map((data ?? []).map((h) => [String(h.id), texto(h.nome) ?? "hotel"]))
}

// ── O link sem senha ─────────────────────────────────────────────────────────

export type AvaliacaoDoLink = {
  token: string
  hotelNome: string | null
  checkIn: string | null
  checkOut: string
  situacao: "pendente" | "respondida"
  nota: number | null
}

export async function avaliacaoPorToken(token: string): Promise<AvaliacaoDoLink | null> {
  if (!UUID.test(token)) return null
  const svc = createServiceClient()
  const { data } = await svc
    .from("hospedagem_avaliacoes")
    .select("token, hotel_id, check_in, check_out, situacao, nota")
    .eq("token", token)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  const nomes = await nomesDeHoteis([String(data.hotel_id)])
  return {
    token: String(data.token),
    hotelNome: nomes.get(String(data.hotel_id)) ?? null,
    checkIn: texto(data.check_in),
    checkOut: String(data.check_out),
    situacao: data.situacao === "respondida" ? "respondida" : "pendente",
    nota: data.nota === null ? null : Number(data.nota),
  }
}

/** Grava a avaliação (uma vez só — depois de enviada não se edita). */
export async function registrarAvaliacao(
  token: string,
  dados: { nota: number; etiquetas: string[]; comentario: string }
): Promise<{ erro?: string }> {
  if (!UUID.test(token)) return { erro: "Link inválido." }
  const invalido = conferirAvaliacao(dados)
  if (invalido) return { erro: invalido }
  const empId = await tenantAtual()
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("hospedagem_avaliacoes")
    .update({
      situacao: "respondida",
      nota: dados.nota,
      etiquetas: [...new Set(dados.etiquetas)],
      comentario: dados.comentario.trim() || null,
      respondida_em: new Date().toISOString(),
    })
    .eq("token", token)
    .eq("emp_proprietaria_id", empId)
    .eq("situacao", "pendente")
    .select("id, hotel_id, check_out")
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_AVALIACOES : `Não foi possível salvar: ${error.message}` }
  if (!data?.length) return { erro: "Esta hospedagem já foi avaliada." }

  if (dados.nota <= NOTA_EXIGE_COMENTARIO) {
    const nomes = await nomesDeHoteis([String(data[0].hotel_id)])
    await avisarGestao(
      empId,
      `Avaliação de ${dados.nota} estrela${dados.nota === 1 ? "" : "s"} (${ROTULO_NOTA[dados.nota].toLowerCase()}) para ${nomes.get(String(data[0].hotel_id)) ?? "um hotel"}.`
    )
  }
  return {}
}

/** Sino para quem gere a hospedagem no tenant (notas baixas). */
async function avisarGestao(empId: string, textoAviso: string): Promise<void> {
  const svc = createServiceClient()
  const { data: perms } = await svc.from("permissoes").select("usuario_id, filiacao_hospedagens_gestao")
  const ids = [
    ...new Set(
      (perms ?? [])
        .filter((p) => p.filiacao_hospedagens_gestao === true)
        .map((p) => texto(p.usuario_id))
        .filter((v): v is string => !!v)
    ),
  ]
  if (!ids.length) return
  const { data: us } = await svc.from("usuarios").select("id").in("id", ids).eq("emp_proprietaria_id", empId)
  for (const u of us ?? []) {
    try {
      await criarNotificacao({ usuarioId: String(u.id), texto: textoAviso, link: "/painel/hospedagem/avaliacoes" })
    } catch (e) {
      console.error("Falha ao avisar a nota baixa:", e)
    }
  }
}

// ── Painéis (sindicato e hotel) ──────────────────────────────────────────────

export type FiltroAvaliacoes = {
  /** Período pelo check-out (AAAA-MM-DD). */
  de?: string
  ate?: string
  hotelId?: string
  nota?: number
  comComentario?: boolean
}

export type AvaliacaoLinha = {
  id: string
  hotelId: string
  hotelNome: string | null
  /** Só para o sindicato (o painel do hotel não recebe). */
  filiadoId: string | null
  filiadoNome: string | null
  checkIn: string | null
  checkOut: string
  situacao: "pendente" | "respondida"
  nota: number | null
  etiquetas: string[]
  comentario: string | null
  respondidaEm: string | null
  tratadaEm: string | null
  tratadaPorNome: string | null
  providencia: string | null
  ocultaHotel: boolean
}

/**
 * Avaliações da entidade (sindicato). O painel do hotel usa
 * `avaliacoesDoHotel`, que tira a identificação e o que está oculto.
 */
export async function listarAvaliacoes(
  empId: string,
  filtro: FiltroAvaliacoes = {}
): Promise<{ disponivel: boolean; linhas: AvaliacaoLinha[] }> {
  const svc = createServiceClient()
  let brutas: Record<string, unknown>[]
  try {
    brutas = await lerEmLotes((de, ate) => {
      let q = svc.from("hospedagem_avaliacoes").select("*").eq("emp_proprietaria_id", empId)
      if (filtro.de) q = q.gte("check_out", filtro.de)
      if (filtro.ate) q = q.lte("check_out", filtro.ate)
      if (filtro.hotelId) q = q.eq("hotel_id", filtro.hotelId)
      return q.order("check_out", { ascending: false }).order("id").range(de, ate)
    })
  } catch (e) {
    if (esquemaAusente(e as { code?: string })) return { disponivel: false, linhas: [] }
    throw e
  }
  const filiadoIds = [...new Set(brutas.map((a) => texto(a.filiado_id)).filter((v): v is string => !!v))]
  const nomesFiliados = new Map<string, string>()
  for (let i = 0; i < filiadoIds.length; i += 200) {
    const { data } = await svc.from("filiacoes").select("id, nome_completo").in("id", filiadoIds.slice(i, i + 200))
    for (const f of data ?? []) nomesFiliados.set(String(f.id), texto(f.nome_completo) ?? "")
  }
  const [hoteis, tratadores] = await Promise.all([
    nomesDeHoteis(brutas.map((a) => String(a.hotel_id))),
    nomesDosUsuarios(brutas.map((a) => texto(a.tratada_por_id)).filter((v): v is string => !!v)),
  ])
  const linhas: AvaliacaoLinha[] = brutas.map((a) => ({
    id: String(a.id),
    hotelId: String(a.hotel_id),
    hotelNome: hoteis.get(String(a.hotel_id)) ?? null,
    filiadoId: texto(a.filiado_id),
    filiadoNome: a.filiado_id ? (nomesFiliados.get(String(a.filiado_id)) || null) : null,
    checkIn: texto(a.check_in),
    checkOut: String(a.check_out),
    situacao: a.situacao === "respondida" ? "respondida" : "pendente",
    nota: a.nota === null || a.nota === undefined ? null : Number(a.nota),
    etiquetas: Array.isArray(a.etiquetas) ? (a.etiquetas as string[]) : [],
    comentario: texto(a.comentario),
    respondidaEm: texto(a.respondida_em),
    tratadaEm: texto(a.tratada_em),
    tratadaPorNome: a.tratada_por_id ? (tratadores.get(String(a.tratada_por_id)) ?? null) : null,
    providencia: texto(a.providencia),
    ocultaHotel: a.oculta_hotel === true,
  }))
  return {
    disponivel: true,
    linhas: linhas.filter(
      (l) =>
        (!filtro.nota || l.nota === filtro.nota) &&
        (!filtro.comComentario || Boolean(l.comentario))
    ),
  }
}

/**
 * O que o HOTEL vê: sem nome, sem datas exatas (só o mês — data e quarto
 * identificariam a pessoa), sem etiquetas "só do sindicato" e sem o texto
 * que o sindicato ocultou.
 */
export type AvaliacaoDoHotel = {
  id: string
  mes: string
  checkOut: string
  situacao: "pendente" | "respondida"
  nota: number | null
  etiquetas: string[]
  comentario: string | null
  comentarioOculto: boolean
}

export async function avaliacoesDoHotel(
  empId: string,
  hotelId: string,
  filtro: Omit<FiltroAvaliacoes, "hotelId">,
  etiquetasVisiveis: (chave: string) => boolean
): Promise<{ disponivel: boolean; linhas: AvaliacaoDoHotel[] }> {
  const { disponivel, linhas } = await listarAvaliacoes(empId, { ...filtro, hotelId })
  return {
    disponivel,
    linhas: linhas.map((l) => ({
      id: l.id,
      mes: l.checkOut.slice(0, 7),
      checkOut: l.checkOut,
      situacao: l.situacao,
      nota: l.nota,
      etiquetas: l.etiquetas.filter(etiquetasVisiveis),
      comentario: l.ocultaHotel ? null : l.comentario,
      comentarioOculto: l.ocultaHotel && Boolean(l.comentario),
    })),
  }
}

/** Sindicato registra a providência de uma nota baixa (e marca tratada). */
export async function tratarAvaliacao(
  empId: string,
  id: string,
  usuarioId: string,
  providencia: string
): Promise<{ erro?: string }> {
  if (providencia.trim().length < 5) return { erro: "Descreva a providência tomada." }
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("hospedagem_avaliacoes")
    .update({ providencia: providencia.trim(), tratada_em: new Date().toISOString(), tratada_por_id: usuarioId })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .eq("situacao", "respondida")
    .select("id")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (!data?.length) return { erro: "Avaliação não encontrada." }
  return {}
}

/** Moderação: oculta do hotel um texto ofensivo (o sindicato segue vendo). */
export async function ocultarDoHotel(
  empId: string,
  id: string,
  usuarioId: string,
  ocultar: boolean
): Promise<{ erro?: string }> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("hospedagem_avaliacoes")
    .update({ oculta_hotel: ocultar, ocultada_por_id: ocultar ? usuarioId : null })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .select("id")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (!data?.length) return { erro: "Avaliação não encontrada." }
  return {}
}

// ── Convites e lembretes (tick diário) ───────────────────────────────────────

/** Entidades com hotel cadastrado — o tick percorre estas. */
export async function tenantsComHotel(): Promise<string[]> {
  const svc = createServiceClient()
  const { data } = await svc.from("hospedagem_hotel").select("emp_proprietaria_id").not("ativo", "is", false)
  return [...new Set((data ?? []).map((h) => texto(h.emp_proprietaria_id)).filter((v): v is string => !!v))]
}

/**
 * Abre as pendências do tenant e manda os e-mails: CONVITE para quem ainda
 * não recebeu e LEMBRETE (uma vez) a quem não respondeu em DIAS_LEMBRETE.
 */
export async function convidarParaAvaliar(empId: string): Promise<{
  criadas: number
  convites: number
  lembretes: number
  erro?: string
}> {
  const { criadas, erro } = await gerarPendencias(empId)
  if (erro) return { criadas: 0, convites: 0, lembretes: 0, erro }
  const svc = createServiceClient()
  const { data: pend } = await svc
    .from("hospedagem_avaliacoes")
    .select("id, token, hotel_id, filiado_id, check_out, convite_enviado_em, lembrete_enviado_em")
    .eq("emp_proprietaria_id", empId)
    .eq("situacao", "pendente")
  if (!pend?.length) return { criadas, convites: 0, lembretes: 0 }

  const limiteLembrete = Date.now() - DIAS_LEMBRETE * 86_400_000
  const aConvidar = pend.filter((a) => !a.convite_enviado_em)
  const aLembrar = pend.filter(
    (a) => a.convite_enviado_em && !a.lembrete_enviado_em && new Date(String(a.convite_enviado_em)).getTime() <= limiteLembrete
  )
  if (!aConvidar.length && !aLembrar.length) return { criadas, convites: 0, lembretes: 0 }

  const contexto = await contextoDoTenant(empId, svc)
  const hoteis = await nomesDeHoteis(pend.map((a) => String(a.hotel_id)))
  const filiadoIds = [...new Set(pend.map((a) => texto(a.filiado_id)).filter((v): v is string => !!v))]
  const contatos = new Map<string, { email: string | null; nome: string | null }>()
  for (let i = 0; i < filiadoIds.length; i += 200) {
    const { data } = await svc
      .from("filiacoes")
      .select("id, nome_completo, email_pessoal")
      .in("id", filiadoIds.slice(i, i + 200))
    for (const f of data ?? []) contatos.set(String(f.id), { email: texto(f.email_pessoal), nome: texto(f.nome_completo) })
  }

  let convites = 0
  let lembretes = 0
  for (const [lista, lembrete] of [[aConvidar, false], [aLembrar, true]] as const) {
    for (const a of lista) {
      const c = a.filiado_id ? contatos.get(String(a.filiado_id)) : undefined
      const agora = new Date().toISOString()
      // Sem e-mail: marca como "enviado" para não tentar todo dia — o cartão
      // do portal e a trava seguem pedindo a avaliação.
      const ok = c?.email
        ? await enviarEmail({
            email: c.email,
            nome: c.nome,
            assunto: lembrete
              ? "Falta pouco: avalie sua hospedagem — {ENTIDADE}"
              : "Como foi sua hospedagem? — {ENTIDADE}",
            html: emailConvite({
              origem: contexto.origem,
              token: String(a.token),
              hotel: hoteis.get(String(a.hotel_id)) ?? "hotel",
              primeiroNome: c.nome?.split(" ")[0] ?? null,
              lembrete,
            }),
            contexto,
          })
        : false
      await svc
        .from("hospedagem_avaliacoes")
        .update(lembrete ? { lembrete_enviado_em: agora } : { convite_enviado_em: agora })
        .eq("id", String(a.id))
      if (ok && lembrete) lembretes++
      else if (ok) convites++
    }
  }
  return { criadas, convites, lembretes }
}

/** E-mail com as 5 estrelas clicáveis (cada uma abre o link já com a nota). */
function emailConvite(p: {
  origem: string
  token: string
  hotel: string
  primeiroNome: string | null
  lembrete: boolean
}): string {
  const base = `${p.origem}/hospedagem/avaliar/${p.token}`
  const estrelas = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<a href="${base}?nota=${n}" title="${ROTULO_NOTA[n]}" style="font-size:32px;line-height:1;text-decoration:none;color:#FF5722;padding:0 4px;">★</a>`
    )
    .join("")
  return [
    tituloEmail(p.lembrete ? "Ainda dá tempo de avaliar" : "Como foi sua hospedagem?"),
    paragrafo(
      `${p.primeiroNome ? `${escaparHtml(p.primeiroNome)}, conte` : "Conte"} como foi a estadia no <strong>${escaparHtml(p.hotel)}</strong>. Toque nas estrelas — de 1 (muito ruim) a 5 (excelente).`
    ),
    `<p style="text-align:center;margin:20px 0;">${estrelas}</p>`,
    botaoEmail(base, "Avaliar a hospedagem"),
    caixaAviso(
      "A avaliação leva menos de um minuto e ajuda o sindicato a cuidar dos convênios. O hotel vê a nota e o comentário <strong>sem o seu nome</strong>. Enquanto ela estiver pendente, o portal pede a avaliação antes de um novo pedido de hospedagem."
    ),
    textoSuave("O link abre sem senha e vale para esta estadia."),
  ].join("\n")
}
