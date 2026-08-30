"use server"

import { type EstadoForm } from "@/lib/contas"
import {
  registrarTerminal,
  registrarVotoTerminal,
} from "@/lib/db/votacao-mesarios"

/** Registra um novo terminal de votação e devolve o código + token do kiosk. */
export async function iniciarTerminal(): Promise<{
  codigo: string
  sessaoToken: string
}> {
  return registrarTerminal()
}

/**
 * O eleitor confirma o voto no terminal. A identidade do TERMINAL vem do token
 * guardado no kiosk (localStorage) e enviado no formulário — nunca liga o voto
 * ao eleitor.
 */
export async function votarNoTerminalAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const token = String(formData.get("sessao_token") ?? "")
  if (!token) return { erro: "Terminal não identificado. Recarregue a página." }

  const escolhas: { perguntaId: string; opcaoId: string }[] = []
  for (const [chave, valor] of formData.entries()) {
    if (chave.startsWith("p_") && typeof valor === "string" && valor) {
      escolhas.push({ perguntaId: chave.slice(2), opcaoId: valor })
    }
  }
  const r = await registrarVotoTerminal(token, escolhas)
  if (r.erro) return { erro: r.erro }
  return { ok: "Voto registrado. Obrigado! Chame o próximo eleitor." }
}
