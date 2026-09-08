"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarReembolso,
  criarReembolso,
  excluirReembolso,
  salvarConfigReembolso,
} from "@/lib/db/filiacao-reembolsos-edicao"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/
const LISTA = "/painel/filiados/reembolsos"

/** Quem lança reembolso: a permissão de reembolsos ou a gestão da filiação. */
async function exigirEdicao() {
  return requirePermissao("filiacao_reembolsos", ["filiacao_gestao"])
}

const texto = (formData: FormData, campo: string) => {
  const v = String(formData.get(campo) ?? "").trim()
  return v === "" ? null : v
}
/** "35", "35,00", "R$ 35,00" e "1.234,56" viram número. */
const dinheiro = (formData: FormData, campo: string): number | null => {
  const bruto = String(formData.get(campo) ?? "").replace(/[^\d,.-]/g, "")
  if (!bruto) return null
  const normalizado = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto
  const n = Number(normalizado)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function revalidar(filiadoId?: string | null, id?: string) {
  revalidatePath(LISTA)
  if (id) revalidatePath(`${LISTA}/${id}`)
  if (filiadoId) revalidatePath(`/painel/filiados/${filiadoId}`)
  revalidatePath("/painel/financeiro/ordens")
}

function lerCampos(formData: FormData) {
  const data = texto(formData, "data")
  if (!data || !DATA.test(data)) return { erro: "Informe a data da participação." }
  const justificativa = texto(formData, "justificativa")
  if (!justificativa) return { erro: "Diga o motivo do reembolso (reunião, ato, assembleia…)." }
  const projetoId = texto(formData, "projeto_id")
  if (projetoId && projetoId !== "sem_projeto" && !UUID.test(projetoId)) return { erro: "Projeto inválido." }
  const valor = dinheiro(formData, "valor")
  if (valor == null || !(valor > 0)) return { erro: "Informe o valor do reembolso." }
  return {
    data,
    justificativa,
    projetoId: projetoId && projetoId !== "sem_projeto" ? projetoId : null,
    valor,
  }
}

export async function criarReembolsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await exigirEdicao()
  const filiadoId = texto(formData, "filiado_id")
  if (!filiadoId || !UUID.test(filiadoId)) return { erro: "Selecione o filiado." }
  const campos = lerCampos(formData)
  if ("erro" in campos) return campos

  const r = await criarReembolso({ filiadoId, ...campos }, sessao.usuario.id)
  if ("erro" in r) return { erro: r.erro }
  revalidar(filiadoId, r.id)
  redirect(`${LISTA}/${r.id}?salvo=1`)
}

export async function atualizarReembolsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = texto(formData, "reembolso_id")
  if (!id || !UUID.test(id)) return { erro: "Reembolso inválido." }
  const campos = lerCampos(formData)
  if ("erro" in campos) return campos

  const r = await atualizarReembolso(id, campos)
  if ("erro" in r) return { erro: r.erro }
  revalidar(texto(formData, "filiado_id"), id)
  redirect(`${LISTA}/${id}?salvo=1`)
}

export async function excluirReembolsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = texto(formData, "reembolso_id")
  if (!id || !UUID.test(id)) return { erro: "Reembolso inválido." }
  const r = await excluirReembolso(id)
  if (r.erro) return { erro: r.erro }
  revalidar(texto(formData, "filiado_id"), id)
  redirect(`${LISTA}?excluido=1`)
}

export async function salvarConfigAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await exigirEdicao()
  const centroCustoId = texto(formData, "centro_custo_id")
  if (centroCustoId && centroCustoId !== "sem_centro" && !UUID.test(centroCustoId)) {
    return { erro: "Centro de custo inválido." }
  }
  const valor = dinheiro(formData, "valor_reembolso")
  if (valor == null || !(valor > 0)) return { erro: "Informe o valor de cada reembolso." }
  const limite = formData.get("orcamento_limite") === "on"
  const orcamento = dinheiro(formData, "orcamento_mensal")
  if (limite && (orcamento == null || !(orcamento > 0))) {
    return { erro: "Com o teto ligado, informe o orçamento mensal." }
  }
  const r = await salvarConfigReembolso(
    {
      valorReembolso: valor,
      centroCustoId: centroCustoId && centroCustoId !== "sem_centro" ? centroCustoId : null,
      orcamentoLimite: limite,
      orcamentoMensal: orcamento,
    },
    sessao.usuario.id
  )
  if (r.erro) return { erro: r.erro }
  revalidatePath(LISTA)
  revalidatePath(`${LISTA}/configuracao`)
  return { ok: "Configuração salva." }
}
