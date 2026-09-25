import "server-only"

import { subirPdfCompras } from "@/lib/db/compras"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarPushTelegram } from "@/lib/db/telegram"
import { buscarViagem, type ItemViagem, type Viagem } from "@/lib/db/viagens"
import { enviarEmail } from "@/lib/email"
import {
  botaoEmail,
  COR,
  escaparHtml,
  linkReserva,
  paragrafo,
  textoSuave,
  tituloEmail,
} from "@/lib/email-layout"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { origemAtual } from "@/lib/tenant-url"
import { descreverHorario, ROTULO_MODAL } from "@/lib/viagens-constantes"

/**
 * Atendimento das viagens pela gestão: registrar a reserva de cada item
 * (agência, localizador, detalhes, valor, bilhete), concluir e avisar, ou
 * encerrar sem atender (recusa/cancelamento). O aviso vai por e-mail a quem
 * viaja e a quem pediu, e por sino/Telegram a quem tem conta.
 */

const ENCERRADAS = ["cancelada", "recusada"] as const
const agora = () => new Date().toISOString()

/** Link assinado do bilhete/voucher. No e-mail vale 7 dias; na tela, 1 hora. */
export async function urlVoucher(
  caminho: string | null,
  segundos = 3600
): Promise<string | null> {
  if (!caminho) return null
  const admin = await createAdminClient()
  const { data } = await admin.storage.from("compras").createSignedUrl(caminho, segundos)
  return data?.signedUrl ?? null
}

/** Marca que a equipe começou a cotar — quem pediu não cancela mais sozinho. */
export async function iniciarAtendimento(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("viagens_solicitacoes")
    .update({ situacao: "em_atendimento", atendido_por: usuarioId, updated_at: agora() })
    .eq("id", id)
    .eq("situacao", "solicitada")
    .select("id")
  if (error) return { erro: `Não foi possível iniciar: ${error.message}` }
  if (!data?.length) return { erro: "Esta viagem já não está aguardando atendimento." }
  return {}
}

export type ReservaItem = {
  fornecedorId: string | null
  localizador: string | null
  reservaDescricao: string | null
  valor: number | null
  voucher: File | null
  removerVoucher: boolean
}

/**
 * Grava a reserva de um item. Na primeira reserva de uma viagem ainda
 * "solicitada", ela passa a "em atendimento". Viagem atendida continua
 * editável (remarcação); encerrada, não.
 */
export async function registrarReservaItem(
  itemId: string,
  reserva: ReservaItem,
  usuarioId: string
): Promise<{ erro?: string; viagemId?: string }> {
  const admin = await createAdminClient()
  const { data: item } = await admin
    .from("viagens_itens")
    .select("id, solicitacao_id, voucher")
    .eq("id", itemId)
    .maybeSingle()
  if (!item) return { erro: "Item não encontrado." }
  const viagem = await buscarViagem(String(item.solicitacao_id))
  if (!viagem) return { erro: "Viagem não encontrada." }
  if ((ENCERRADAS as readonly string[]).includes(viagem.situacao)) {
    return { erro: "Esta viagem foi encerrada — não recebe mais reservas." }
  }
  if (viagem.itens.find((i) => i.id === itemId)?.faturaId) {
    return { erro: "Este item já está numa fatura — desfaça a fatura para alterar a reserva." }
  }
  if (!reserva.localizador && !reserva.reservaDescricao) {
    return { erro: "Informe o localizador ou descreva a reserva." }
  }
  if (reserva.valor !== null && (!Number.isFinite(reserva.valor) || reserva.valor < 0)) {
    return { erro: "Valor inválido." }
  }

  let voucher: string | null = reserva.removerVoucher ? null : texto(item.voucher)
  if (reserva.voucher && reserva.voucher.size > 0) {
    const { caminho, erro } = await subirPdfCompras(
      `viagens/${viagem.id}/${itemId}`,
      reserva.voucher
    )
    if (erro) return { erro }
    voucher = caminho ?? null
  }

  const { error } = await admin
    .from("viagens_itens")
    .update({
      fornecedor_id: reserva.fornecedorId,
      localizador: reserva.localizador,
      reserva_descricao: reserva.reservaDescricao,
      valor: reserva.valor,
      voucher,
      updated_at: agora(),
    })
    .eq("id", itemId)
  if (error) return { erro: `Não foi possível gravar a reserva: ${error.message}` }

  if (viagem.situacao === "solicitada") {
    await admin
      .from("viagens_solicitacoes")
      .update({ situacao: "em_atendimento", atendido_por: usuarioId, updated_at: agora() })
      .eq("id", viagem.id)
      .eq("situacao", "solicitada")
  }
  return { viagemId: viagem.id }
}

/** Conclui: todos os itens reservados → "atendida" e avisa. */
export async function concluirAtendimento(
  id: string,
  usuarioId: string
): Promise<{ erro?: string; avisados?: number }> {
  const viagem = await buscarViagem(id)
  if (!viagem) return { erro: "Viagem não encontrada." }
  if (viagem.situacao !== "solicitada" && viagem.situacao !== "em_atendimento") {
    return { erro: "Esta viagem não está em atendimento." }
  }
  const pendentes = viagem.itens.filter((i) => !i.reservado).length
  if (pendentes > 0) {
    return {
      erro: `Falta registrar a reserva de ${pendentes} ${pendentes === 1 ? "item" : "itens"}.`,
    }
  }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("viagens_solicitacoes")
    .update({
      situacao: "atendida",
      atendido_por: usuarioId,
      atendido_em: agora(),
      updated_at: agora(),
    })
    .eq("id", id)
    .in("situacao", ["solicitada", "em_atendimento"])
    .select("id")
  if (error) return { erro: `Não foi possível concluir: ${error.message}` }
  if (!data?.length) return { erro: "Outra pessoa acabou de mudar esta viagem — recarregue." }

  const atualizada = (await buscarViagem(id)) ?? viagem
  return { avisados: await avisar(atualizada, "atendida") }
}

/**
 * Encerra sem atender. Recusa só antes de atender; cancelamento vale também
 * depois (a viagem não vai mais acontecer). O motivo vai no aviso.
 */
export async function encerrarViagem(
  id: string,
  como: "recusada" | "cancelada",
  motivo: string,
  usuarioId: string
): Promise<{ erro?: string; avisados?: number }> {
  if (!motivo.trim()) return { erro: "Informe o motivo — ele vai no aviso a quem pediu." }
  const viagem = await buscarViagem(id)
  if (!viagem) return { erro: "Viagem não encontrada." }
  if ((ENCERRADAS as readonly string[]).includes(viagem.situacao)) {
    return { erro: "Esta viagem já foi encerrada." }
  }
  if (como === "recusada" && viagem.situacao === "atendida") {
    return { erro: "A viagem já foi atendida — use Cancelar." }
  }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("viagens_solicitacoes")
    .update({
      situacao: como,
      motivo_situacao: motivo.trim(),
      atendido_por: usuarioId,
      encerrado_em: agora(),
      updated_at: agora(),
    })
    .eq("id", id)
    .eq("situacao", viagem.situacao)
    .select("id")
  if (error) return { erro: `Não foi possível encerrar: ${error.message}` }
  if (!data?.length) return { erro: "Outra pessoa acabou de mudar esta viagem — recarregue." }

  const atualizada = (await buscarViagem(id)) ?? viagem
  return { avisados: await avisar(atualizada, como) }
}

// ── Aviso ───────────────────────────────────────────────────────────────────

type Destinatario = {
  email: string | null
  nome: string | null
  usuarioId: string | null
  /** Quem viaja (true) ou quem pediu por ela (false). */
  viaja: boolean
  link: string | null
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

function resumoCurto(v: Viagem): string {
  const primeiro = v.itens[0]
  if (!primeiro) return `nº ${v.numero ?? "—"}`
  const lugar =
    primeiro.tipo === "passagem" ? `${primeiro.origem} → ${primeiro.destino}` : primeiro.cidade
  return `nº ${v.numero ?? "—"} (${lugar}${v.itens.length > 1 ? " e mais" : ""})`
}

async function destinatarios(v: Viagem): Promise<Destinatario[]> {
  const origem = await origemAtual()
  const ids = [v.beneficiarioUsuarioId, v.solicitanteId].filter((x): x is string => !!x)
  const admin = await createAdminClient()
  const { data } = ids.length
    ? await admin.from("usuarios").select("id, email, nome_completo, nome_guerra").in("id", ids)
    : { data: [] }
  const porId = new Map(
    ((data ?? []) as Record<string, unknown>[]).map((u) => [String(u.id), u])
  )
  const lista: Destinatario[] = []

  if (v.beneficiarioTipo === "convidado") {
    lista.push({
      email: v.convidadoEmail,
      nome: v.beneficiarioNome,
      usuarioId: null,
      viaja: true,
      link: null,
    })
  } else if (v.beneficiarioUsuarioId) {
    const u = porId.get(v.beneficiarioUsuarioId)
    lista.push({
      email: texto(u?.email),
      nome: texto(u?.nome_guerra) ?? texto(u?.nome_completo) ?? v.beneficiarioNome,
      usuarioId: v.beneficiarioUsuarioId,
      viaja: true,
      link: `${origem}/painel/perfil/viagens/${v.id}`,
    })
  }
  // Quem pediu por outra pessoa é da equipe de viagens (só ela lança por
  // terceiros): o link dele é o da gestão.
  if (v.solicitanteId && v.solicitanteId !== v.beneficiarioUsuarioId) {
    const u = porId.get(v.solicitanteId)
    lista.push({
      email: texto(u?.email),
      nome: texto(u?.nome_guerra) ?? texto(u?.nome_completo) ?? v.solicitanteNome,
      usuarioId: v.solicitanteId,
      viaja: false,
      link: `${origem}/painel/viagens/${v.id}`,
    })
  }
  return lista
}

function linhaEmail(rotulo: string, valor: string | null): string {
  if (!valor) return ""
  return `<tr><td style="padding:2px 12px 2px 0;color:${COR.textoSuave};font-size:13px;vertical-align:top;white-space:nowrap;">${escaparHtml(rotulo)}</td><td style="padding:2px 0;font-size:14px;">${escaparHtml(valor).replaceAll("\n", "<br>")}</td></tr>`
}

function blocoItem(item: ItemViagem, indice: number, voucherUrl: string | null): string {
  const titulo =
    item.tipo === "passagem"
      ? `Passagem ${item.modal ? ROTULO_MODAL[item.modal].toLowerCase() : ""}: ${item.origem} → ${item.destino}`
      : `Hospedagem em ${item.cidade}`
  const linhas =
    item.tipo === "passagem"
      ? [
          linhaEmail("Data", item.dataViagem ? formatarData(item.dataViagem) : null),
          linhaEmail(
            "Pedido",
            [
              descreverHorario(item.saidaCriterio, item.saidaHora) &&
                `saída ${descreverHorario(item.saidaCriterio, item.saidaHora)}`,
              descreverHorario(item.chegadaCriterio, item.chegadaHora) &&
                `chegada ${descreverHorario(item.chegadaCriterio, item.chegadaHora)}`,
            ]
              .filter(Boolean)
              .join(", ") || null
          ),
        ]
      : [
          linhaEmail(
            "Período",
            item.checkin && item.checkout
              ? `${formatarData(item.checkin)} a ${formatarData(item.checkout)}`
              : null
          ),
        ]
  const reserva = [
    linhaEmail("Localizador", item.localizador),
    linhaEmail("Reserva", item.reservaDescricao),
    linhaEmail("Emitida por", item.fornecedorNome),
  ]
  const bilhete = voucherUrl
    ? `<p style="margin:8px 0 0;font-size:13px;"><a href="${voucherUrl}" style="color:${COR.laranjaAcao};">Baixar ${item.tipo === "passagem" ? "o bilhete" : "o voucher"} (PDF)</a> <span style="color:${COR.textoSuave};">— link válido por 7 dias</span></p>`
    : ""
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
<tr><td style="border:1px solid ${COR.navyBorda};border-radius:8px;padding:14px 16px;">
<p style="margin:0 0 8px;font-weight:600;color:${COR.navy};">${indice + 1}. ${escaparHtml(titulo)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">${[...linhas, ...reserva].join("")}</table>
${bilhete}
</td></tr></table>`
}

/** Avisa quem viaja e quem pediu. Devolve quantos e-mails saíram. */
async function avisar(
  v: Viagem,
  evento: "atendida" | "recusada" | "cancelada"
): Promise<number> {
  const lista = await destinatarios(v)
  const vouchers =
    evento === "atendida"
      ? await Promise.all(v.itens.map((i) => urlVoucher(i.voucher, 7 * 24 * 3600)))
      : []
  let enviados = 0

  for (const d of lista) {
    const deQuem = d.viaja ? "Sua viagem" : `A viagem de ${v.beneficiarioNome}`
    const curta =
      evento === "atendida"
        ? `${deQuem} ${resumoCurto(v)} está reservada.`
        : `${deQuem} ${resumoCurto(v)} foi ${evento}. Motivo: ${v.motivoSituacao ?? "—"}`

    if (d.usuarioId) {
      try {
        await criarNotificacao({ usuarioId: d.usuarioId, texto: curta })
      } catch (e) {
        console.error("Falha ao notificar viagem:", e)
      }
      await enviarPushTelegram(d.usuarioId, curta, "viagens")
    }
    if (!d.email) continue

    const ola = paragrafo(`Olá${d.nome ? `, ${escaparHtml(d.nome.split(" ")[0])}` : ""}!`)
    const corpo =
      evento === "atendida"
        ? [
            tituloEmail(d.viaja ? "Sua viagem está reservada" : "Viagem reservada"),
            ola,
            paragrafo(
              `${escaparHtml(deQuem)} nº ${v.numero ?? "—"} — <em>${escaparHtml(v.motivo)}</em> — já está reservada. Confira os dados:`
            ),
            ...v.itens.map((item, i) => blocoItem(item, i, vouchers[i] ?? null)),
            d.link ? botaoEmail(d.link, "Ver a viagem no Confluir") + linkReserva(d.link) : "",
            textoSuave(
              "Confira nome, datas e horários. Se algo estiver errado, responda a este e-mail o quanto antes — remarcar custa menos longe da data."
            ),
          ]
        : [
            tituloEmail(evento === "recusada" ? "Pedido de viagem recusado" : "Viagem cancelada"),
            ola,
            paragrafo(
              `${escaparHtml(deQuem)} nº ${v.numero ?? "—"} — <em>${escaparHtml(v.motivo)}</em> — foi ${evento}.`
            ),
            paragrafo(`<strong>Motivo:</strong> ${escaparHtml(v.motivoSituacao ?? "—")}`),
            d.link ? botaoEmail(d.link, "Ver a viagem no Confluir") : "",
          ]

    const ok = await enviarEmail({
      email: d.email,
      nome: d.nome,
      assunto:
        evento === "atendida"
          ? `Viagem nº ${v.numero ?? ""} reservada — {ENTIDADE}`
          : `Viagem nº ${v.numero ?? ""} ${evento} — {ENTIDADE}`,
      html: corpo.join("\n"),
    }).catch(() => false)
    if (ok) enviados++
  }
  return enviados
}
