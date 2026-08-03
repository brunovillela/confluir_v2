"use server"

import { requirePermissao } from "@/lib/auth"
import { gerarTextoIA, type ResultadoIA } from "@/lib/ia"
import { ROTULOS_TIPO_OFICIO, type TipoOficio } from "@/lib/oficios-constantes"

const SISTEMA = `Você é assistente de redação de um sindicato e aprimora o CORPO de um ofício oficial.
Reescreva o texto do usuário em português do Brasil formal, claro e coeso, no tom institucional e respeitoso próprio de um documento oficial de sindicato.
Regras:
- PRESERVE o sentido e todos os fatos, valores, nomes, datas e prazos do original — não invente nem remova informação.
- Corrija gramática, pontuação e clareza; melhore a fluência sem inflar o texto.
- Devolva APENAS o corpo do ofício, no mesmo escopo do texto enviado.
- NÃO inclua cabeçalho, data, número do ofício, o assunto, nem bloco de assinatura/cargo — isso é gerado à parte pelo sistema.
- NÃO adicione preâmbulo, comentários, aspas ou títulos — só o texto do corpo.`

export async function melhorarOficio(input: {
  corpo: string
  assunto?: string
  tipo?: string
  destinatario?: string
}): Promise<ResultadoIA> {
  await requirePermissao("ferramentas_oficios")

  const corpo = (input.corpo ?? "").trim()
  if (corpo.length < 10) {
    return { erro: "Escreva o corpo do ofício antes de usar a IA." }
  }

  const rotulo =
    input.tipo && input.tipo in ROTULOS_TIPO_OFICIO
      ? ROTULOS_TIPO_OFICIO[input.tipo as TipoOficio]
      : null

  const partes = [`Corpo atual do ofício:\n${corpo}`]
  if (input.assunto?.trim()) partes.push(`Assunto: ${input.assunto.trim()}`)
  if (rotulo) partes.push(`Tipo de ofício: ${rotulo}`)
  if (input.destinatario?.trim()) {
    partes.push(`Destinatário: ${input.destinatario.trim()}`)
  }

  return gerarTextoIA({ system: SISTEMA, prompt: partes.join("\n\n") })
}
