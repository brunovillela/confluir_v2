"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import type { EstadoForm } from "@/lib/contas"
import { posterioresPorFuncionario, recalcularPosteriores } from "@/lib/db/ponto-cascata"
import { regrasApuracaoPonto } from "@/lib/db/ponto-config"
import { jornadaDoFuncionario } from "@/lib/db/pessoal-sst"
import { duasCasas } from "@/lib/horas"
import { apurarMes } from "@/lib/ponto-apuracao"
import { aplicarAjuste, conferirDia, desfazerAjustes, lerBatidas, type MarcacoesEspelho } from "@/lib/ponto-marcacoes-ajuste"
import { escolherJornada, leituraDasMarcacoes } from "@/lib/ponto-recalculo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Ajuste das marcações do espelho (16/11/2026): corrigir um dia lido pela IA,
 * incluir um dia que faltou, retirar um dia e voltar ao lido. Só a gestão de
 * pessoal; as horas lançadas no registro não mudam (as marcações alimentam os
 * indicadores e os alertas).
 */

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim()

/** O registro (da entidade atual) com a competência e as marcações. */
async function registroDaEntidade(registroId: string) {
  const admin = await createAdminClient()
  const { data: reg } = await admin
    .from("pessoal_registro_ponto")
    .select("id, funcionario_id, remessa_id, marcacoes")
    .eq("id", registroId)
    .maybeSingle()
  if (!reg) return null
  const { data: rem } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, emp_proprietaria_id")
    .eq("id", String(reg.remessa_id))
    .maybeSingle()
  if (!rem || String(rem.emp_proprietaria_id) !== (await tenantAtual())) return null
  return { admin, reg }
}

function revalidar(funcionarioId: string, registroId: string, remessaId: string) {
  revalidatePath(`/painel/pessoal/ponto/funcionario/${funcionarioId}/${registroId}`)
  revalidatePath(`/painel/pessoal/ponto/funcionario/${funcionarioId}`)
  revalidatePath(`/painel/pessoal/ponto/${remessaId}`)
  revalidatePath("/painel/pessoal/ponto/analise")
}

/** Corrige ou inclui um dia (`retirar=1` tira o dia). */
export async function salvarDiaMarcacaoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("pessoal_gestao")
  const registroId = texto(formData, "registro_id")
  const data = texto(formData, "data")
  const competencia = texto(formData, "competencia")
  const retirar = texto(formData, "retirar") === "1"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe o dia." }
  if (texto(formData, "conferir") === "1") return conferir(registroId, data, sessao, texto(formData, "motivo"))
  if (competencia && !data.startsWith(competencia)) return { erro: "O dia precisa ser do mês do registro." }
  const lidas = retirar ? { batidas: [] } : lerBatidas(texto(formData, "batidas"))
  if ("erro" in lidas) return { erro: lidas.erro }
  const ocorrencia = texto(formData, "ocorrencia").slice(0, 60) || null
  if (!retirar && lidas.batidas.length === 0 && !ocorrencia) {
    return { erro: "Informe as batidas ou a ocorrência do dia (Folga, Feriado, Atestado…)." }
  }

  const achado = await registroDaEntidade(registroId)
  if (!achado) return { erro: "Registro não encontrado." }
  const { admin, reg } = achado
  const atual = (reg.marcacoes ?? null) as MarcacoesEspelho | null
  if (retirar && !atual?.dias.some((d) => d.data === data)) return { erro: "Esse dia não está nas marcações." }
  const novo = aplicarAjuste(
    atual,
    { data, marcacoes: lidas.batidas, ocorrencia, retirar },
    {
      id: String(sessao.usuario.id),
      nome: String(sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? "") || null,
      motivo: texto(formData, "motivo").slice(0, 300) || null,
      em: new Date().toISOString(),
    }
  )
  const { error } = await admin.from("pessoal_registro_ponto").update({ marcacoes: novo }).eq("id", registroId)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  revalidar(String(reg.funcionario_id), registroId, String(reg.remessa_id))
  const dia = data.split("-").reverse().slice(0, 2).join("/")
  return { ok: retirar ? `Dia ${dia} retirado das marcações.` : `Marcações de ${dia} salvas.` }
}

/** Volta o dia ao que o espelho trazia antes dos ajustes. */
export async function desfazerAjusteDiaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("pessoal_gestao")
  const registroId = texto(formData, "registro_id")
  const data = texto(formData, "data")
  const achado = await registroDaEntidade(registroId)
  if (!achado) return { erro: "Registro não encontrado." }
  const { admin, reg } = achado
  const atual = (reg.marcacoes ?? null) as MarcacoesEspelho | null
  if (!atual) return { erro: "Sem marcações." }
  const novo = desfazerAjustes(atual, data, {
    id: String(sessao.usuario.id),
    nome: String(sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? "") || null,
    em: new Date().toISOString(),
  })
  if (novo === atual) return { erro: "Esse dia não foi ajustado." }
  const { error } = await admin.from("pessoal_registro_ponto").update({ marcacoes: novo }).eq("id", registroId)
  if (error) return { erro: `Não foi possível desfazer: ${error.message}` }
  revalidar(String(reg.funcionario_id), registroId, String(reg.remessa_id))
  return { ok: "O dia voltou ao que o espelho trazia." }
}

type Sessao = Awaited<ReturnType<typeof requirePermissao>>
const quemE = (sessao: Sessao) => ({
  id: String(sessao.usuario.id),
  nome: String(sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? "") || null,
})

/** O dia está certo como está (o alerta é real): sai da fila "Dias para conferir". */
async function conferir(registroId: string, data: string, sessao: Sessao, motivo: string): Promise<EstadoForm> {
  const achado = await registroDaEntidade(registroId)
  if (!achado) return { erro: "Registro não encontrado." }
  const { admin, reg } = achado
  const atual = (reg.marcacoes ?? null) as MarcacoesEspelho | null
  if (!atual?.dias.some((d) => d.data === data)) return { erro: "Esse dia não está nas marcações." }
  const novo = conferirDia(atual, data, { ...quemE(sessao), motivo: motivo.slice(0, 300) || null, em: new Date().toISOString() })
  if (novo === atual) return { ok: "Esse dia já estava conferido." }
  const { error } = await admin.from("pessoal_registro_ponto").update({ marcacoes: novo }).eq("id", registroId)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  revalidar(String(reg.funcionario_id), registroId, String(reg.remessa_id))
  return { ok: `${data.split("-").reverse().slice(0, 2).join("/")} conferido como está.` }
}

// ── Recalcular as horas pelas marcações ──────────────────────────────────────

export type PreviaRecalculo = {
  faixa1: number
  faixa2: number
  atual1: number
  atual2: number
  jornada: string
  alertas: string[]
  /** Dias com número ímpar de batidas: contam a menos se aplicar assim. */
  incompletos: string[]
  /** Remessas depois desta em que o funcionário aparece (o saldo é refeito em cascata). */
  posteriores: { remessa: string; finalizada: boolean }[]
}
export type EstadoRecalculo = EstadoForm & { previa?: PreviaRecalculo }

/** As horas realizadas que as marcações (com os ajustes) dão, sem gravar. */
async function apurarPeloMarcado(
  registroId: string
): Promise<{ erro: string } | { previa: PreviaRecalculo; reg: Record<string, unknown> }> {
  if (!(await registroDaEntidade(registroId))) return { erro: "Registro não encontrado." }
  const admin = await createAdminClient()
  const { data: reg } = await admin
    .from("pessoal_registro_ponto")
    .select(
      "id, funcionario_id, remessa_id, marcacoes, horas_realizadas_70, horas_realizadas_100, horas_pagas_70, horas_pagas_100, saldo_remessa_anterior_70, saldo_remessa_anterior_100"
    )
    .eq("id", registroId)
    .maybeSingle()
  if (!reg) return { erro: "Registro não encontrado." }
  const m = (reg.marcacoes ?? null) as MarcacoesEspelho | null
  if (!m?.dias.length) return { erro: "O registro não tem marcações: inclua os dias ou leia o espelho antes." }
  const funcionarioId = String(reg.funcionario_id)
  const [regras, vinculada, posteriores] = await Promise.all([
    regrasApuracaoPonto(),
    jornadaDoFuncionario(funcionarioId),
    posterioresPorFuncionario(String(reg.remessa_id)),
  ])
  const jornada = escolherJornada(m, vinculada ? { nome: vinculada.nome, dias: vinculada.dias } : null)
  if (!jornada) {
    return { erro: "Sem jornada prevista: vincule uma jornada ao funcionário (Atribuições e SST → Jornadas) para recalcular." }
  }
  const a = apurarMes(leituraDasMarcacoes(m, jornada.dias), regras)
  if (a.semBatidas) return { erro: "As marcações não têm batidas no mês: informe as horas à mão, se houver." }
  return {
    reg: reg as Record<string, unknown>,
    previa: {
      faixa1: duasCasas(a.realizadasFaixa1Min / 60),
      faixa2: duasCasas(a.realizadasFaixa2Min / 60),
      atual1: Number(reg.horas_realizadas_70 ?? 0),
      atual2: Number(reg.horas_realizadas_100 ?? 0),
      jornada: jornada.descricao,
      alertas: a.alertas,
      incompletos: a.incompletos,
      posteriores: posteriores[funcionarioId] ?? [],
    },
  }
}

/** Mostra o que o recálculo daria (nada é gravado). */
export async function previaRecalculoAction(_prev: EstadoRecalculo, formData: FormData): Promise<EstadoRecalculo> {
  await requirePermissao("pessoal_gestao")
  const r = await apurarPeloMarcado(texto(formData, "registro_id"))
  return "erro" in r ? { erro: r.erro } : { previa: r.previa }
}

/** Grava as realizadas que as marcações dão, refaz o saldo e, se pedido, as remessas seguintes. */
export async function aplicarRecalculoAction(_prev: EstadoRecalculo, formData: FormData): Promise<EstadoRecalculo> {
  await requirePermissao("pessoal_gestao")
  const registroId = texto(formData, "registro_id")
  const r = await apurarPeloMarcado(registroId)
  if ("erro" in r) return { erro: r.erro }
  const { reg, previa } = r
  const remessaId = String(reg.remessa_id)
  const admin = await createAdminClient()
  const { data: rem } = await admin.from("pessoal_registro_ponto_remessas").select("finalizada").eq("id", remessaId).maybeSingle()
  if (rem?.finalizada === true) return { erro: "A remessa está finalizada — reabra a remessa para mexer nas horas." }
  const num = (v: unknown) => Number(v ?? 0)
  const { error } = await admin
    .from("pessoal_registro_ponto")
    .update({
      horas_realizadas_70: previa.faixa1,
      horas_realizadas_100: previa.faixa2,
      saldo_remanescente_70: duasCasas(num(reg.saldo_remessa_anterior_70) + previa.faixa1 - num(reg.horas_pagas_70)),
      saldo_remanescente_100: duasCasas(num(reg.saldo_remessa_anterior_100) + previa.faixa2 - num(reg.horas_pagas_100)),
    })
    .eq("id", registroId)
    .eq("remessa_id", remessaId)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  let cascata = ""
  if (texto(formData, "recalcular_posteriores") === "1" && previa.posteriores.length) {
    try {
      const c = await recalcularPosteriores(remessaId, String(reg.funcionario_id))
      if (c.recalculadas.length) cascata += ` Saldo refeito em ${c.recalculadas.join(", ")}.`
      if (c.paradaEm) cascata += ` Parou em ${c.paradaEm}, que está finalizada.`
    } catch (e) {
      cascata = ` As remessas seguintes não foram refeitas: ${(e as Error).message}`
    }
    revalidatePath("/painel/pessoal/ponto", "layout")
  }
  revalidar(String(reg.funcionario_id), registroId, remessaId)
  return { ok: `Horas recalculadas pelas marcações.${cascata}` }
}
