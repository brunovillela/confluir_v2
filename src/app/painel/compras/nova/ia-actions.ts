"use server"

import { requirePermissao } from "@/lib/auth"
import { gerarTextoIA, type ResultadoIA } from "@/lib/ia"

const SISTEMA = `Você é assistente de um sindicato e ajuda a redigir a descrição de itens de uma solicitação de compra, para o setor de Compras cotar com fornecedores.
Reescreva o rascunho do usuário como uma descrição CLARA, OBJETIVA e PADRONIZADA do produto ou serviço a adquirir.
Regras:
- Português do Brasil, tom formal e direto.
- Foque no QUE deve ser adquirido: especificações, quantidade, unidade e características relevantes para cotação.
- NÃO invente dados que não estejam no rascunho (não crie marca, modelo, valor ou fornecedor).
- NÃO adicione preâmbulo, saudação, título, aspas ou comentários — devolva apenas o texto da descrição.
- Se houver bastante informação, organize em frases curtas ou tópicos com "- ".`

export async function gerarDescricaoCompra(input: {
  produto: string
  observacao?: string
  tipo?: string
}): Promise<ResultadoIA> {
  await requirePermissao("aquisicoes_compras_edicao")

  const rascunho = (input.produto ?? "").trim()
  if (rascunho.length < 3) {
    return {
      erro: "Escreva um rascunho do produto ou serviço antes de usar a IA.",
    }
  }

  const tipoRotulo =
    input.tipo === "servico"
      ? "prestação de serviço"
      : input.tipo === "bem"
        ? "bem / produto"
        : null

  const partes = [`Rascunho do item: ${rascunho}`]
  if (tipoRotulo) partes.push(`Tipo: ${tipoRotulo}`)
  const obs = (input.observacao ?? "").trim()
  if (obs) partes.push(`Observações do solicitante: ${obs}`)

  return gerarTextoIA({
    system: SISTEMA,
    prompt: partes.join("\n"),
  })
}
