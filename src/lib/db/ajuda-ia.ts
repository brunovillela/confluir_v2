import "server-only"

import { BASE_AJUDA } from "@/lib/ajuda/base-conhecimento"
import { pessoasComAcesso } from "@/lib/db/acessos"
import { gerarTextoIA } from "@/lib/ia"

const SYSTEM = `Você é o assistente do Manual do Confluir, um sistema de gestão sindical. Sua tarefa é responder à PERGUNTA de quem usa o sistema, com base EXCLUSIVA no MANUAL fornecido e no funcionamento nele descrito.

Regras:
- Responda em português, de forma direta e prática. Quando fizer sentido, dê o passo a passo e diga em qual ÁREA/tela a ação acontece.
- Se a ação pertencer a uma ÁREA a que QUEM PERGUNTA não tem acesso, avise isso e indique QUEM ela pode procurar — escolhendo, entre as PESSOAS listadas, alguém que tenha acesso à área relevante (cite o nome). Se não houver ninguém, oriente a procurar a administração/coordenação.
- Se a pergunta não estiver coberta pelo manual, seja honesto ("isso não está no manual") e, se possível, indique quem pode ajudar.
- NUNCA invente funcionalidades, telas ou dados. NÃO exponha e-mails, CPFs ou dados pessoais — indique pessoas apenas pelo nome.
- Use texto simples (sem markdown pesado): parágrafos curtos e hífens "- " para listas. Seja conciso (até ~10 linhas).`

export async function responderPerguntaAjuda(
  pergunta: string,
  quemPergunta: { nome: string | null; areas: string[] }
): Promise<{ texto?: string; erro?: string }> {
  const p = pergunta.trim()
  if (p.length < 3) return { erro: "Escreva sua pergunta com um pouco mais de detalhe." }
  if (p.length > 1000) return { erro: "Pergunta muito longa. Resuma um pouco." }

  const pessoas = await pessoasComAcesso()

  // O manual inteiro cabe no contexto do modelo; corta por segurança.
  const manual = BASE_AJUDA.map(
    (a) => `## ${a.area} / ${a.slug}\n${a.texto}`
  )
    .join("\n\n")
    .slice(0, 120000)

  const listaPessoas =
    pessoas
      .map(
        (pe) =>
          `- ${pe.nome}: ${pe.admin ? "Administração (todas as áreas)" : pe.areas.join(", ")}`
      )
      .join("\n") || "(nenhuma pessoa com acesso cadastrada)"

  const prompt = `MANUAL DO CONFLUIR:
${manual}

---
PESSOAS DA ORGANIZAÇÃO E AS ÁREAS A QUE TÊM ACESSO (use para indicar quem procurar):
${listaPessoas}

---
QUEM PERGUNTA: ${quemPergunta.nome ?? "usuário"} — tem acesso a: ${
    quemPergunta.areas.join(", ") || "nenhuma área"
  }

PERGUNTA: ${p}`

  return gerarTextoIA({ system: SYSTEM, prompt })
}
