import "server-only"

import { chaveDaConta, chaveDoPix } from "@/lib/bancos"
import { filtroDosDonos, type DonosDaPessoa, type TipoDono } from "@/lib/db/dados-bancarios-pessoa"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * CONTA REPETIDA (27/10/2026): antes de gravar, procura nas contas da MESMA
 * pessoa — o dono e os outros cadastros dela com o mesmo CPF (usuário,
 * filiado, fornecedor PF) — uma com a mesma agência+conta (sem zeros à
 * esquerda nem pontuação) ou, quando a nova é só Pix, a mesma chave. Devolve a
 * que já existe e onde ela está (null = não há). Foi a falta disto que deixou
 * 108 cópias no mesmo cadastro e 24 entre cadastros da mesma pessoa.
 */
export async function dadoRepetido(
  donos: Partial<DonosDaPessoa>,
  novo: { agencia?: string | null; conta?: string | null; pix?: string | null },
  ignorarId?: string | null
): Promise<{ id: string; origem: TipoDono } | null> {
  const filtro = filtroDosDonos({ fornecedor_id: donos.fornecedor_id ?? [], usuario_id: donos.usuario_id ?? [], filiado_id: donos.filiado_id ?? [] })
  if (!filtro) return null
  const conta = chaveDaConta(novo.agencia, novo.conta)
  const pix = conta ? null : chaveDoPix(novo.pix)
  if (!conta && !pix) return null
  const admin = await createAdminClient()
  const { data } = await admin.from("dados_bancarios").select("id, agencia, conta, pix, fornecedor_id, usuario_id, filiado_id").or(filtro)
  const achado = ((data ?? []) as Record<string, unknown>[]).find((d) => {
    if (ignorarId && String(d.id) === ignorarId) return false
    const dConta = chaveDaConta(d.agencia as string | null, d.conta as string | null)
    return conta ? dConta === conta : !dConta && chaveDoPix(d.pix as string | null) === pix
  })
  if (!achado) return null
  return { id: String(achado.id), origem: achado.fornecedor_id ? "fornecedor" : achado.usuario_id ? "usuario" : "filiado" }
}

const ONDE: Record<TipoDono, string> = {
  fornecedor: "no cadastro de fornecedor",
  usuario: "no Pessoal (funcionário/diretor)",
  filiado: "na ficha do filiado",
}

/** Mensagem para quem tentou cadastrar a conta de novo (`aqui` = o papel da ficha). */
export function avisoRepetida(r: { origem: TipoDono }, aqui: TipoDono): string {
  return r.origem === aqui
    ? "Esta conta (ou chave Pix) já está cadastrada para este favorecido. Edite a que existe em vez de criar outra."
    : `Esta conta (ou chave Pix) já está ${ONDE[r.origem]} desta pessoa (mesmo CPF) e já vale aqui — não é preciso cadastrar de novo.`
}
