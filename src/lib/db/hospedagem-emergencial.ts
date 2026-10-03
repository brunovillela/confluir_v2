import "server-only"

import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { cadastroDoFiliado, registrosDoCpf } from "@/lib/db/filiado-portal"
import { contratoDoHotel, type Hotel } from "@/lib/db/hospedagem"
import { conferirCondicoesHospedagem } from "@/lib/db/hospedagem-condicoes"
import {
  conferirPodeReservar,
  ehGarantida,
  enviarEmailReservaConfirmada,
  reservarEstadia,
} from "@/lib/db/hospedagem-garantida"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Cupom EMERGENCIAL — o pessoal do hotel faz a reserva direta quando o
 * hóspede não consegue pedir pelo portal. Só para HOJE e só para o hotel da
 * sessão, com as mesmas regras do cupom (portal e gestão):
 *   - filiado com condição "Ativo";
 *   - hotel comum: convênio vigente, sem cupom repetido na data, condições
 *     do sindicato — o cupom nasce "aguardando reserva" e o hotel registra a
 *     reserva em seguida, como sempre;
 *   - demanda garantida: condições + não comparecimento, e a reserva sai na
 *     hora, com o quarto definido.
 * Fica marcado (emergencial, quem do hotel, quando, motivo) e a gestão é
 * avisada no sino. SQL: supabase/hospedagem-cupom-emergencial.sql.
 */

export const AVISO_SQL_EMERGENCIAL =
  "Rode supabase/hospedagem-cupom-emergencial.sql no Supabase para liberar o cupom emergencial."

export type FiliadoEmergencial = {
  /** Só o primeiro nome e a inicial do último — o hotel não precisa de mais. */
  nomeExibicao: string
  garantida: boolean
}

type Conferido = {
  cadastro: NonNullable<Awaited<ReturnType<typeof cadastroDoFiliado>>>
  registros: string[]
}

function nomeCurto(nome: string | null): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return "Filiado(a)"
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0]
}

/** As colunas do emergencial existem? (o SQL pode não ter rodado) */
async function colunasProntas(): Promise<boolean> {
  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_cupom").select("emergencial").limit(1)
  return !error || !esquemaAusente(error)
}

/** Todas as conferências do cupom para HOJE neste hotel. */
async function conferir(hotel: Hotel, cpf: string): Promise<Conferido | { erro: string }> {
  if (hotel.ativo === false) return { erro: "Este hotel está inativo e não recebe cupons." }
  const cadastro = await cadastroDoFiliado(cpf)
  if (!cadastro) return { erro: "CPF não encontrado entre os filiados do sindicato." }
  if (cadastro.filiacao_condicao !== "Ativo") {
    return { erro: "Este CPF não está com a filiação ativa — o subsídio de hospedagem é só para filiados ativos." }
  }
  const registros = await registrosDoCpf(cpf)
  const hoje = hojeSP()

  if (ehGarantida(hotel)) {
    const pode = await conferirPodeReservar({ cpf: cadastro.cpf, registros, checkIn: hoje })
    if (pode.erro) return { erro: pode.erro }
    return { cadastro, registros }
  }

  const contrato = await contratoDoHotel(hotel.id)
  if (!contrato || !contrato.vigente) {
    return { erro: "O convênio deste hotel não está vigente hoje — cupons indisponíveis." }
  }
  const admin = await createAdminClient()
  const { data: duplicado } = await admin
    .from("hospedagem_cupom")
    .select("id")
    .in("filiado_id", registros)
    .eq("hotel_id", hotel.id)
    .eq("check_in", hoje)
    .eq("cancelado", false)
    .limit(1)
  if ((duplicado ?? []).length) return { erro: "Este filiado já tem cupom neste hotel para hoje." }
  const condicoes = await conferirCondicoesHospedagem({ cpf: cadastro.cpf, registros, checkIn: hoje })
  if (condicoes.erro) return { erro: condicoes.erro }
  return { cadastro, registros }
}

/** Passo 1: o CPF é de filiado apto a usar o hotel hoje? */
export async function buscarFiliadoEmergencial(
  hotel: Hotel,
  cpf: string
): Promise<{ erro?: string; filiado?: FiliadoEmergencial }> {
  if (!(await colunasProntas())) return { erro: AVISO_SQL_EMERGENCIAL }
  const r = await conferir(hotel, cpf)
  if ("erro" in r) return { erro: r.erro }
  return { filiado: { nomeExibicao: nomeCurto(r.cadastro.nome_completo), garantida: ehGarantida(hotel) } }
}

/** Passo 2: registra o cupom (ou a reserva, na garantida) marcado como emergencial. */
export async function registrarCupomEmergencial(p: {
  hotel: Hotel
  usuarioHotelId: string
  cpf: string
  motivo: string
  /** Só na demanda garantida (a reserva já sai com a saída). */
  checkOut?: string | null
  aceitaColetivo?: boolean
}): Promise<{ erro?: string; cupomId?: string; garantida?: boolean }> {
  if (!(await colunasProntas())) return { erro: AVISO_SQL_EMERGENCIAL }
  const motivo = p.motivo.trim()
  if (motivo.length < 5) return { erro: "Diga por que o hóspede não conseguiu pedir pelo portal." }

  // Confere de novo: entre a busca e a confirmação algo pode ter mudado.
  const r = await conferir(p.hotel, p.cpf)
  if ("erro" in r) return { erro: r.erro }
  const hoje = hojeSP()
  const marca = {
    emergencial: true,
    emergencial_por_id: p.usuarioHotelId,
    emergencial_em: new Date().toISOString(),
    emergencial_motivo: motivo.slice(0, 500),
  }
  const admin = await createAdminClient()
  let cupomId: string

  if (ehGarantida(p.hotel)) {
    const checkOut = String(p.checkOut ?? "")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= hoje) {
      return { erro: "Informe a data de saída (depois de hoje)." }
    }
    const reserva = await reservarEstadia({
      hotel: p.hotel,
      filiadoId: r.cadastro.id,
      registros: r.registros,
      sexo: r.cadastro.sexo,
      checkIn: hoje,
      checkOut,
    })
    if (!reserva.ok) return { erro: reserva.erro }
    cupomId = reserva.cupomId
    const { error } = await admin.from("hospedagem_cupom").update(marca).eq("id", cupomId)
    if (error) console.error("Cupom emergencial sem a marca:", error.message)
    await enviarEmailReservaConfirmada({
      cpf: r.cadastro.cpf,
      hotelNome: p.hotel.nome ?? "hotel",
      checkIn: hoje,
      checkOut,
      token: reserva.token,
    })
  } else {
    const { data, error } = await admin
      .from("hospedagem_cupom")
      .insert({
        filiado_id: r.cadastro.id,
        hotel_id: p.hotel.id,
        check_in: hoje,
        sexo: r.cadastro.sexo,
        aceita_quarto_coletivo: p.aceitaColetivo === true,
        cancelado: false,
        compareceu: false,
        ...marca,
      })
      .select("id")
      .single()
    if (error || !data) return { erro: `Não foi possível registrar o cupom: ${error?.message ?? "?"}` }
    cupomId = String(data.id)
  }

  await avisarGestao(
    `${p.hotel.nome ?? "Um hotel"} fez um cupom emergencial para hoje (${nomeCurto(r.cadastro.nome_completo)}): ${motivo}`
  )
  return { cupomId, garantida: ehGarantida(p.hotel) }
}

/** Sino para quem gere a hospedagem no tenant. */
async function avisarGestao(textoAviso: string): Promise<void> {
  const svc = await createAdminClient()
  const empId = await tenantAtual()
  const { data: perms } = await svc.from("permissoes").select("usuario_id, filiacao_hospedagens_gestao")
  const ids = [
    ...new Set(
      (perms ?? [])
        .filter((x) => x.filiacao_hospedagens_gestao === true)
        .map((x) => texto(x.usuario_id))
        .filter((v): v is string => !!v)
    ),
  ]
  if (!ids.length) return
  const { data: us } = await svc.from("usuarios").select("id").in("id", ids).eq("emp_proprietaria_id", empId)
  for (const u of us ?? []) {
    try {
      await criarNotificacao({ usuarioId: String(u.id), texto: textoAviso, link: "/painel/hospedagem/cupons" })
    } catch (e) {
      console.error("Falha ao avisar o cupom emergencial:", e)
    }
  }
}
