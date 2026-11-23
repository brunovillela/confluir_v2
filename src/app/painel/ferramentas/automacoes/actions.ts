"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { alternarRegra, criarRegra, excluirRegra } from "@/lib/db/regras"
import { validarRegra, type AcaoRegra, type GatilhoRegra, PARAMETRO_DA_ACAO } from "@/lib/ferramentas-regras"

const CAMINHO = "/painel/ferramentas/automacoes"

export async function criarRegraAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_demandas")
  const gatilho = String(fd.get("gatilho") ?? "")
  const acao = String(fd.get("acao") ?? "")
  const parametro = PARAMETRO_DA_ACAO[acao as AcaoRegra]
  const pessoaId = parametro === "pessoa" ? String(fd.get("pessoa_id") ?? "") || null : null
  const etiquetaId = parametro === "etiqueta" ? String(fd.get("etiqueta_id") ?? "") || null : null
  const erro = validarRegra({ gatilho, acao, pessoaId, etiquetaId })
  if (erro) return { erro }
  const r = await criarRegra(
    { gatilho: gatilho as GatilhoRegra, acao: acao as AcaoRegra, demandaId: String(fd.get("demanda_id") ?? "") || null, pessoaId, etiquetaId },
    String(sessao.usuario.id)
  )
  if (r.erro) return { erro: r.erro }
  revalidatePath(CAMINHO)
  return { ok: "Automação criada." }
}

export async function alternarRegraAction(id: string, ativa: boolean): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const r = await alternarRegra(id, ativa)
  if (r.erro) return { erro: r.erro }
  revalidatePath(CAMINHO)
  return { ok: ativa ? "Automação ligada." : "Automação desligada." }
}

export async function excluirRegraAction(id: string): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const r = await excluirRegra(id)
  if (r.erro) return { erro: r.erro }
  revalidatePath(CAMINHO)
  return { ok: "Automação excluída." }
}
