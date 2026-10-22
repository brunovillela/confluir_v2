import "server-only"

import QRCode from "qrcode"

import { temVotoOnline } from "@/lib/assembleias-constantes"
import { dadosDoAviso } from "@/lib/db/votacao-aviso"
import { resumoAvisoContato } from "@/lib/db/votacao-aviso-contato"
import { janelasOnline } from "@/lib/db/votacao-sem-link"
import { diaHora } from "@/lib/email-aviso-aptos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * KIT DE DIVULGAÇÃO DA RODADA (fase 2 do plano de 21/10/2026,
 * docs/plano-votacao-entrega-preparacao.md).
 *
 * Na Halliburton, 971 pessoas cadastraram e-mail pessoal ou Telegram no link
 * geral — mas durante a votação, já precisando de código. O kit leva o
 * trabalhador ao link geral ANTES da abertura, pelo WhatsApp e pelos
 * delegados: cadastrado, ele recebe o link pessoal no canal que escolheu
 * (fase 1, lib/db/votacao-aviso-contato.ts). Com a votação aberta, o texto
 * vira o de "vote agora", com as dicas do Telegram e do lixo eletrônico.
 */

export type KitDivulgacao = {
  /** Endereço do link geral (/votar). */
  link: string
  /** QR code do link geral (data URL PNG). */
  qr: string
  /** "antes" = pré-cadastro; "aberta" = vote agora. */
  momento: "antes" | "aberta"
  abre: string | null
  fecha: string | null
  /** Texto pronto para WhatsApp (negrito com *asteriscos*). */
  texto: string
  aptos: number
  /** Aptos com e-mail pessoal ou Telegram confirmado no link geral. */
  preCadastrados: number
  porEmail: number
  porTelegram: number
}

export function textoDivulgacao(k: {
  titulo: string
  tema: string | null
  momento: "antes" | "aberta"
  abre: string | null
  fecha: string | null
  link: string
}): string {
  const nome = k.tema ? `${k.tema} — ${k.titulo}` : k.titulo
  if (k.momento === "aberta") {
    return [
      `🗳️ *Votação aberta: ${nome}*`,
      k.fecha ? `Vote pela internet até *${k.fecha}* (horário de Brasília).` : null,
      `👉 ${k.link}`,
      "• Pelo *Telegram* é mais rápido: não precisa de código nem de e-mail.",
      "• Pelo e-mail: use um e-mail *pessoal* (o da empresa costuma bloquear). O código pode cair no *Lixo eletrônico* (Hotmail/Outlook) ou em *Promoções* (Gmail).",
      "O voto é secreto. Ninguém do sindicato pede o seu código.",
    ]
      .filter(Boolean)
      .join("\n\n")
  }
  return [
    `🗳️ *${nome}*`,
    k.abre && k.fecha
      ? `A votação pela internet vai de *${k.abre}* até *${k.fecha}* (horário de Brasília).`
      : k.abre
        ? `A votação pela internet abre *${k.abre}* (horário de Brasília).`
        : null,
    `*Cadastre-se antes* para receber o seu link pessoal de voto — na abertura é só tocar e votar, sem código:\n👉 ${k.link}`,
    "• O jeito mais fácil é pelo *Telegram*: não precisa de e-mail nem de código.",
    "• Se preferir e-mail, use um e-mail *pessoal* (Gmail, Hotmail…): o da empresa costuma bloquear as nossas mensagens.",
    "Leva 2 minutos: você confirma nome, CPF, nascimento e o e-mail da empresa, uma vez só.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** Kit da rodada (null = sem voto pela internet, ou votação já encerrada). */
export async function kitDivulgacao(rodadaId: string): Promise<KitDivulgacao | null> {
  const client = await createAdminClient()
  const emp = await tenantAtual()
  const [janela] = await janelasOnline({ client, emp }, { rodadaIds: [rodadaId] })
  if (!janela) return null
  const { dados } = await dadosDoAviso(rodadaId)
  if (!dados) return null
  const online = dados.assembleias.find((a) => temVotoOnline(a.modalidade))
  const abre = online ? diaHora(online.data_inicio, online.hora_inicio) : null
  const fecha = online ? diaHora(online.data_termino, online.hora_termino) : null
  const link = `${await origemAtual()}/votar`
  const momento = janela.aberta ? "aberta" : "antes"

  const [qr, contato, total] = await Promise.all([
    QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 2, width: 512 }),
    resumoAvisoContato(rodadaId),
    client
      .from("voto_assembleias_aptos")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("rod_assembleia_id", rodadaId),
  ])
  return {
    link,
    qr,
    momento,
    abre,
    fecha,
    texto: textoDivulgacao({ titulo: dados.rodadaNome, tema: dados.campanhaTema, momento, abre, fecha, link }),
    aptos: total.count ?? 0,
    preCadastrados: contato?.comContato ?? 0,
    porEmail: contato?.porEmail ?? 0,
    porTelegram: contato?.porTelegram ?? 0,
  }
}
