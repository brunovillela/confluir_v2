import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { FAIXAS_PADRAO, faixasDe, type FaixasHE } from "@/lib/faixas-he"
import { REGRAS_PADRAO, type RegrasApuracao } from "@/lib/ponto-apuracao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/** Percentuais das faixas de hora extra da entidade (padrão 50% e 100%). */
export async function percentuaisHoraExtra(): Promise<{ faixa1: number; faixa2: number }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_folha_config")
    .select("he_faixa1_percentual, he_faixa2_percentual")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return FAIXAS_PADRAO
    throw new Error(`Falha ao ler as faixas de hora extra: ${error.message}`)
  }
  return {
    faixa1: data?.he_faixa1_percentual != null ? Number(data.he_faixa1_percentual) : FAIXAS_PADRAO.faixa1,
    faixa2: data?.he_faixa2_percentual != null ? Number(data.he_faixa2_percentual) : FAIXAS_PADRAO.faixa2,
  }
}

/** Rótulos das faixas ("70%", "100%"…) para as telas. */
export async function faixasHoraExtra(): Promise<FaixasHE> {
  const p = await percentuaisHoraExtra()
  return faixasDe(p.faixa1, p.faixa2)
}

/** Grava os percentuais (cria a linha da entidade se faltar). */
export async function salvarPercentuaisHoraExtra(faixa1: number, faixa2: number): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_folha_config")
    .upsert(
      { emp_proprietaria_id: await tenantAtual(), he_faixa1_percentual: faixa1, he_faixa2_percentual: faixa2 },
      { onConflict: "emp_proprietaria_id" }
    )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}

// ── Regras de apuração pelas batidas (29/10) ────────────────────────────────

/** Regras da entidade para apurar as horas do mês pelas batidas (padrão: REGRAS_PADRAO). */
export async function regrasApuracaoPonto(): Promise<RegrasApuracao> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_folha_config")
    .select(
      "he_faixa2_sabado, he_faixa2_domingo, he_faixa2_feriado, he_negativas, he_tolerancia_diaria_min, he_ocorrencias_abonam, he_mes_sem_batidas"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error || !data) return REGRAS_PADRAO
  return {
    faixa2Sabado: data.he_faixa2_sabado !== false,
    faixa2Domingo: data.he_faixa2_domingo !== false,
    faixa2Feriado: data.he_faixa2_feriado !== false,
    negativas: data.he_negativas === "faixa1_depois_faixa2" ? "faixa1_depois_faixa2" : "faixa1",
    toleranciaDiariaMin: Number.isFinite(Number(data.he_tolerancia_diaria_min))
      ? Number(data.he_tolerancia_diaria_min)
      : REGRAS_PADRAO.toleranciaDiariaMin,
    ocorrenciasAbonam: Array.isArray(data.he_ocorrencias_abonam) ? data.he_ocorrencias_abonam : REGRAS_PADRAO.ocorrenciasAbonam,
    mesSemBatidas: data.he_mes_sem_batidas === "lancar" ? "lancar" : "alertar",
  }
}

export async function salvarRegrasApuracaoPonto(r: RegrasApuracao): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_folha_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      he_faixa2_sabado: r.faixa2Sabado,
      he_faixa2_domingo: r.faixa2Domingo,
      he_faixa2_feriado: r.faixa2Feriado,
      he_negativas: r.negativas,
      he_tolerancia_diaria_min: r.toleranciaDiariaMin,
      he_ocorrencias_abonam: r.ocorrenciasAbonam,
      he_mes_sem_batidas: r.mesSemBatidas,
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}
