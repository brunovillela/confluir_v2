"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import {
  atualizarTermo,
  criarTermo,
  definirVigente,
  excluirTermo,
  ROTULO_TIPO_TERMO,
  type TipoTermo,
} from "@/lib/db/filiacao-termos"
import { gerarTextoIA, type ResultadoIA } from "@/lib/ia"

const AQUI = "/painel/filiados/termos"

function ehTipo(v: unknown): v is TipoTermo {
  return v === "lgpd" || v === "desconto"
}

export async function criarTermoAction(input: {
  tipo: string
  texto: string
}): Promise<{ erro?: string }> {
  await requirePermissao("filiacao_gestao")
  if (!ehTipo(input.tipo)) return { erro: "Tipo inválido." }
  const { erro } = await criarTermo(input.tipo, input.texto)
  if (erro) return { erro }
  revalidatePath(AQUI)
  revalidatePath("/filiar")
  return {}
}

export async function atualizarTermoAction(input: {
  tipo: string
  id: string
  texto: string
}): Promise<{ erro?: string }> {
  await requirePermissao("filiacao_gestao")
  if (!ehTipo(input.tipo)) return { erro: "Tipo inválido." }
  const { erro } = await atualizarTermo(input.tipo, input.id, input.texto)
  if (erro) return { erro }
  revalidatePath(AQUI)
  revalidatePath("/filiar")
  return {}
}

export async function definirVigenteAction(input: {
  tipo: string
  id: string
}): Promise<{ erro?: string }> {
  await requirePermissao("filiacao_gestao")
  if (!ehTipo(input.tipo)) return { erro: "Tipo inválido." }
  const { erro } = await definirVigente(input.tipo, input.id)
  if (erro) return { erro }
  revalidatePath(AQUI)
  revalidatePath("/filiar")
  return {}
}

export async function excluirTermoAction(input: {
  tipo: string
  id: string
}): Promise<{ erro?: string }> {
  await requirePermissao("filiacao_gestao")
  if (!ehTipo(input.tipo)) return { erro: "Tipo inválido." }
  const { erro } = await excluirTermo(input.tipo, input.id)
  if (erro) return { erro }
  revalidatePath(AQUI)
  revalidatePath("/filiar")
  return {}
}

const SISTEMA = `Você é assistente jurídico de um sindicato e aprimora um TERMO legal de filiação.
Reescreva o texto do usuário em português do Brasil formal, claro e juridicamente preciso, no tom de um documento de consentimento/autorização.
Regras:
- PRESERVE o sentido, os percentuais, valores, prazos e todas as referências legais (leis, artigos, incisos) do original — não invente nem remova conteúdo jurídico.
- Corrija gramática, pontuação e clareza; deixe o consentimento inequívoco, sem inflar o texto.
- Devolva APENAS o texto do termo, no mesmo escopo do enviado.
- NÃO adicione preâmbulo, comentários, aspas, títulos ou assinatura.`

export async function melhorarTermoAction(input: {
  tipo: string
  texto: string
}): Promise<ResultadoIA> {
  await requirePermissao("filiacao_gestao")
  const t = (input.texto ?? "").trim()
  if (t.length < 10) return { erro: "Escreva o texto do termo antes de usar a IA." }
  const rotulo = ehTipo(input.tipo) ? ROTULO_TIPO_TERMO[input.tipo] : "termo"
  return gerarTextoIA({
    system: SISTEMA,
    prompt: `Tipo de termo: ${rotulo}\n\nTexto atual:\n${t}`,
  })
}
