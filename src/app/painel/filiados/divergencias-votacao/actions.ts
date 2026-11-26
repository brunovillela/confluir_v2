"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { tratarDivergencia } from "@/lib/db/votacao-divergencias"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Trata uma divergência das votações: atualiza a ficha com o declarado ou registra o que foi feito. */
export async function tratarDivergenciaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_filiados", ["filiacao_gestao"])
  const aptoId = String(fd.get("apto_id") ?? "")
  if (!UUID.test(aptoId)) return { erro: "Divergência inválida." }
  const fichaId = String(fd.get("ficha_id") ?? "")
  const r = await tratarDivergencia({
    aptoId,
    fichaId: UUID.test(fichaId) ? fichaId : null,
    usarNome: fd.get("usar_nome") === "on",
    usarNascimento: fd.get("usar_nascimento") === "on",
    fonte: String(fd.get("fonte") ?? "") || null,
    observacao: String(fd.get("observacao") ?? ""),
    usuarioId: String(sessao.usuario.id),
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/filiados/divergencias-votacao")
  revalidatePath("/painel/filiados")
  return { ok: "Divergência tratada." }
}
