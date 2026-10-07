import "server-only"

import { nomesDosUsuarios } from "@/lib/db/comum"
import { pessoasParaDepartamento } from "@/lib/db/departamentos"

/**
 * Quem pode constar como comprador numa aquisição direta: funcionários
 * ativos e diretores do mandato vigente com conta de usuário (07/10/2026).
 * Quem lança entra sempre — vem selecionado no formulário, e pode ser uma
 * conta fora do quadro (recepção, por exemplo).
 */
export async function compradoresPossiveis(usuarioAtual: string): Promise<{ id: string; nome: string; origem: string }[]> {
  const pessoas = await pessoasParaDepartamento().catch(() => [])
  const porId = new Map<string, { id: string; nome: string; origem: string }>()
  for (const p of pessoas) {
    if (!p.usuarioId) continue
    const origem = p.origem === "diretor" ? "Diretor" : "Funcionário"
    const atual = porId.get(p.usuarioId)
    // Quem é as duas coisas aparece uma vez, com as duas.
    if (atual) {
      if (!atual.origem.includes(origem)) atual.origem = `${atual.origem} e ${origem.toLowerCase()}`
      continue
    }
    porId.set(p.usuarioId, { id: p.usuarioId, nome: p.nome, origem })
  }
  if (!porId.has(usuarioAtual)) {
    const nome = (await nomesDosUsuarios([usuarioAtual])).get(usuarioAtual) ?? "Você"
    porId.set(usuarioAtual, { id: usuarioAtual, nome, origem: "" })
  }
  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}
