"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import {
  ORIGENS_ORDEM,
  regrasDaOrigem,
  type OrigemOrdem,
  type Severidade,
} from "@/lib/auditoria-regras-catalogo"
import { type EstadoForm } from "@/lib/contas"
import { salvarRegras } from "@/lib/db/auditoria-regras"
import { parseValorBR } from "@/lib/valores"

const SEVERIDADES: Severidade[] = ["aceitar", "alertar", "bloquear"]

export async function salvarRegrasAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_auditoria")
  const origem = String(formData.get("origem") ?? "") as OrigemOrdem
  if (!ORIGENS_ORDEM.some((o) => o.chave === origem)) return { erro: "Origem inválida." }

  const regras = []
  for (const regra of regrasDaOrigem(origem)) {
    const sev = String(formData.get(`sev_${regra.codigo}`) ?? "") as Severidade
    if (!SEVERIDADES.includes(sev)) return { erro: `Escolha a resposta de "${regra.titulo}".` }
    const parametros: Record<string, number | string | boolean> = {}
    for (const p of regra.parametros ?? []) {
      const bruto = String(formData.get(`par_${regra.codigo}_${p.chave}`) ?? "").trim()
      if (p.tipo === "sim_nao") {
        parametros[p.chave] = formData.get(`par_${regra.codigo}_${p.chave}`) === "on"
      } else if (p.tipo === "texto") {
        if (!bruto) return { erro: `Preencha "${p.rotulo}" em "${regra.titulo}".` }
        parametros[p.chave] = bruto.slice(0, 1000)
      } else {
        const v = !/\d/.test(bruto) ? null : p.tipo === "moeda" ? parseValorBR(bruto) : Number(bruto)
        if (v === null || !Number.isFinite(v) || v < 0) {
          return { erro: `Valor inválido em "${p.rotulo}" (${regra.titulo}).` }
        }
        parametros[p.chave] = p.tipo === "dias" ? Math.round(v) : v
      }
    }
    regras.push({ codigo: regra.codigo, severidade: sev, parametros })
  }

  const { erro } = await salvarRegras(origem, regras, sessao.usuario.id)
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/auditoria")
  const rotulo = ORIGENS_ORDEM.find((o) => o.chave === origem)?.rotulo ?? origem
  return { ok: `Regras de ${rotulo} salvas. Valem para as próximas ordens criadas.` }
}
