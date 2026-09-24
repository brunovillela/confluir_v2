"use server"

import {
  confirmarPedido,
  filiadoPeloCpf,
  registrarPedido,
  reenviarCodigo,
} from "@/lib/db/espacos-solicitacao"
import { getSessaoPainel } from "@/lib/auth"
import { tenantAtual } from "@/lib/tenant"

/**
 * Ações do link público do espaço. Não há sessão: o tenant vem do subdomínio
 * (tenantAtual lê o header posto pelo proxy).
 */

export type EstadoPedido = {
  erro?: string
  /** Token do pedido criado — a tela passa a pedir o código. */
  token?: string
  /** Número do pedido, quando o código foi confirmado. */
  numero?: number
  ok?: string
}

const txt = (fd: FormData, nome: string) => String(fd.get(nome) ?? "").trim()
const sim = (fd: FormData, nome: string) => fd.get(nome) === "on"

/** Porta dos espaços cedidos só a filiados: confere o CPF na base. */
export async function conferirFiliadoAction(
  _prev: EstadoPedido,
  fd: FormData
): Promise<EstadoPedido & { nome?: string; email?: string }> {
  const { erro, nome, email } = await filiadoPeloCpf(txt(fd, "cpf"))
  return erro ? { erro } : { ok: "encontrado", nome, email }
}

export async function registrarPedidoAction(
  _prev: EstadoPedido,
  fd: FormData
): Promise<EstadoPedido> {
  const tenantId = await tenantAtual()
  const espacoId = txt(fd, "espaco_id")
  if (!espacoId) return { erro: "Espaço não identificado." }

  // Espaço de público interno exige sessão do painel — a porta é o login.
  if (txt(fd, "publico_alvo") === "interno") {
    const sessao = await getSessaoPainel()
    if (!sessao) {
      return {
        erro: "Este espaço é reservado ao público interno. Entre no sistema para solicitar.",
      }
    }
  }

  const publicoBruto = txt(fd, "publico_estimado")
  const { erro, token } = await registrarPedido(
    {
      espacoId,
      nome: txt(fd, "nome"),
      cpf: txt(fd, "cpf") || null,
      email: txt(fd, "email"),
      telefone: txt(fd, "telefone") || null,
      entidade: txt(fd, "entidade") || null,
      representanteNome: txt(fd, "representante_nome") || null,
      representanteTelefone: txt(fd, "representante_telefone") || null,
      inicio: txt(fd, "inicio"),
      termino: txt(fd, "termino"),
      montagemInicio: txt(fd, "montagem_inicio") || null,
      desmontagemTermino: txt(fd, "desmontagem_termino") || null,
      finalidade: txt(fd, "finalidade"),
      publicoEstimado: publicoBruto ? Number(publicoBruto) : null,
      respostas: {
        infantil: sim(fd, "tem_infantil"),
        idoso: sim(fd, "tem_idoso"),
        mobilidade: sim(fd, "tem_mobilidade"),
        bebida: sim(fd, "tem_bebida"),
        estresse: sim(fd, "tem_estresse"),
      },
      observacoes: txt(fd, "observacoes") || null,
    },
    tenantId
  )
  return erro ? { erro } : { token }
}

export async function confirmarPedidoAction(
  _prev: EstadoPedido,
  fd: FormData
): Promise<EstadoPedido> {
  const { erro, numero } = await confirmarPedido(
    txt(fd, "token"),
    txt(fd, "codigo"),
    await tenantAtual()
  )
  return erro ? { erro, token: txt(fd, "token") } : { numero, token: txt(fd, "token") }
}

export async function reenviarCodigoAction(
  _prev: EstadoPedido,
  fd: FormData
): Promise<EstadoPedido> {
  const token = txt(fd, "token")
  const { erro } = await reenviarCodigo(token, await tenantAtual())
  return erro ? { erro, token } : { token, ok: "Código reenviado." }
}
