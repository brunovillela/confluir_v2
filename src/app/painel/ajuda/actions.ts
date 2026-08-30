"use server"

import { requireSessaoPainel } from "@/lib/auth"
import { responderPerguntaAjuda } from "@/lib/db/ajuda-ia"
import { CATALOGO_PERMISSOES } from "@/lib/permissoes-catalogo"

export type EstadoPergunta = { erro?: string; resposta?: string; pergunta?: string }

export async function perguntarAjudaAction(
  _prev: EstadoPergunta,
  formData: FormData
): Promise<EstadoPergunta> {
  const sessao = await requireSessaoPainel()
  const pergunta = String(formData.get("pergunta") ?? "").trim()
  if (!pergunta) return { erro: "Escreva sua pergunta." }

  const perms = sessao.permissoes
  const admin = perms.permissoes === true || perms.configuracoes === true
  const areas = admin
    ? CATALOGO_PERMISSOES.map((a) => a.area)
    : CATALOGO_PERMISSOES.filter((a) =>
        a.flags.some((f) => perms[f.chave] === true)
      ).map((a) => a.area)

  const r = await responderPerguntaAjuda(pergunta, {
    nome: sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra,
    areas,
  })
  if (r.erro) return { erro: r.erro, pergunta }
  return { resposta: r.texto, pergunta }
}
