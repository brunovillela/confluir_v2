"use server"

import { requirePermissao } from "@/lib/auth"
import { nomeEntidade } from "@/lib/db/organizacao"
import { gerarJsonIA } from "@/lib/ia"

const SISTEMA = `Você revisa a mensagem de parabéns que um sindicato manda aos filiados no dia do aniversário, por e-mail e por WhatsApp.

Regras:
- Português do Brasil. Tom caloroso e respeitoso: próximo, mas institucional. Sem exagero, sem bajulação, sem clichês empilhados.
- Mantenha EXATAMENTE as variáveis entre chaves que aparecerem: {primeiro_nome}, {nome}, {entidade}. Não invente outras variáveis. Se o rascunho não tiver, use {primeiro_nome} na saudação e {entidade} na assinatura.
- NÃO invente fatos, benefícios, eventos, datas, números ou promessas que não estejam no rascunho ou na orientação.
- Nada de política partidária, de religião, nem de menção a saúde, doença, velhice ou limitações — mesmo para idades avançadas, fale de trajetória e conquistas.
- Se houver um público descrito (ex.: aposentados, quem completa 60 anos, filiados há 20 anos), adapte o texto a ele com delicadeza.
- Assunto do e-mail: curto, até 60 caracteres.
- E-mail: 2 a 4 parágrafos curtos, separados por UMA linha em branco; saudação no início e assinatura com {entidade} no fim. Texto puro: sem markdown, sem HTML, sem asteriscos.
- WhatsApp: 1 a 3 frases, até 300 caracteres, no máximo um emoji.
- Respeite a orientação do usuário quando houver.

Devolva um JSON com as chaves "assunto", "mensagem" (o e-mail) e "texto_whatsapp".`

export type ParabensIA = { assunto?: string; mensagem?: string; textoWhatsapp?: string; erro?: string }

/** "Melhorar com IA": reescreve assunto, e-mail e WhatsApp do parabéns. */
export async function melhorarParabensAction(entrada: {
  assunto: string
  mensagem: string
  textoWhatsapp: string
  orientacao?: string
  publico?: string
  /** O e-mail sai na véspera do aniversário. */
  vespera?: boolean
}): Promise<ParabensIA> {
  await requirePermissao("comunicacao_mensagens")
  const rascunho = [entrada.assunto, entrada.mensagem, entrada.textoWhatsapp].join(" ").trim()
  if (rascunho.length < 10 && !(entrada.orientacao ?? "").trim()) {
    return { erro: "Escreva um rascunho ou diga, na orientação, o que a mensagem deve ter." }
  }
  const entidade = await nomeEntidade()
  const prompt = [
    `Entidade: ${entidade}`,
    entrada.publico ? `Público desta mensagem: ${entrada.publico}` : "Público: todos os filiados (mensagem padrão)",
    entrada.vespera
      ? "Quando chega: na VÉSPERA do aniversário — o texto fala de amanhã (ex.: \"amanhã é o seu dia\"), nunca de hoje."
      : "Quando chega: no dia do aniversário.",
    entrada.orientacao?.trim() ? `Orientação do usuário: ${entrada.orientacao.trim()}` : null,
    "",
    `Assunto atual: ${entrada.assunto.trim() || "(vazio)"}`,
    "",
    "E-mail atual:",
    entrada.mensagem.trim() || "(vazio)",
    "",
    "WhatsApp atual:",
    entrada.textoWhatsapp.trim() || "(vazio)",
  ]
    .filter((l) => l !== null)
    .join("\n")

  const r = await gerarJsonIA({ system: SISTEMA, prompt })
  if (r.erro || !r.dados) return { erro: r.erro ?? "A IA não respondeu." }
  const campo = (k: string) => (typeof r.dados?.[k] === "string" ? String(r.dados[k]).trim() : "")
  const assunto = campo("assunto")
  const mensagem = campo("mensagem")
  const textoWhatsapp = campo("texto_whatsapp")
  if (!assunto || !mensagem || !textoWhatsapp) return { erro: "A IA devolveu a mensagem incompleta. Tente de novo." }
  return { assunto, mensagem, textoWhatsapp }
}
