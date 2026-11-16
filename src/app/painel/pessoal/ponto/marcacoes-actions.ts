"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import type { EstadoForm } from "@/lib/contas"
import { aplicarAjuste, desfazerAjustes, lerBatidas, type MarcacoesEspelho } from "@/lib/ponto-marcacoes-ajuste"
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
