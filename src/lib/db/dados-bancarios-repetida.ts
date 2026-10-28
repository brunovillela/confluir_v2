import "server-only"

import { chaveDaConta, chaveDoPix } from "@/lib/bancos"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * CONTA REPETIDA (27/10/2026): antes de gravar, procura nas contas do MESMO
 * dono uma com a mesma agência+conta (sem zeros à esquerda nem pontuação) ou,
 * quando a nova é só Pix, a mesma chave. Devolve o id da que já existe (null
 * = não há). Foi a falta disto que deixou 108 cópias no cadastro.
 */
export async function dadoRepetido(
  dono: { coluna: "fornecedor_id" | "usuario_id" | "filiado_id"; ids: string[] },
  novo: { agencia?: string | null; conta?: string | null; pix?: string | null },
  ignorarId?: string | null
): Promise<string | null> {
  if (dono.ids.length === 0) return null
  const conta = chaveDaConta(novo.agencia, novo.conta)
  const pix = conta ? null : chaveDoPix(novo.pix)
  if (!conta && !pix) return null
  const admin = await createAdminClient()
  const { data } = await admin.from("dados_bancarios").select("id, agencia, conta, pix").in(dono.coluna, dono.ids)
  const achado = ((data ?? []) as Record<string, unknown>[]).find((d) => {
    if (ignorarId && String(d.id) === ignorarId) return false
    const dConta = chaveDaConta(d.agencia as string | null, d.conta as string | null)
    return conta ? dConta === conta : !dConta && chaveDoPix(d.pix as string | null) === pix
  })
  return achado ? String(achado.id) : null
}

export const AVISO_REPETIDA = "Esta conta (ou chave Pix) já está cadastrada para este favorecido. Edite a que existe em vez de criar outra."
