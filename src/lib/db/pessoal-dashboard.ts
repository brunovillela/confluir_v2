import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { listarFuncionarios } from "@/lib/db/pessoal"
import { somarMeses } from "@/lib/db/treinamentos"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Painel do módulo Pessoal — contagens leves (count head) por área, para os
 * alertas acionáveis e os indicadores dos cards do hub. Tabelas ainda não
 * criadas (diárias/reembolsos, aguardando SQL) degradam para null e somem da
 * UI. Janelas: anuênios/níveis 30 dias, ASO 90 dias, férias 120 dias.
 */

export type ResumoPessoal = {
  funcionariosAtivos: number
  remessasContrachequesAbertas: number
  remessasPontoAbertas: number
  informesRemessasAbertas: number
  anueniosTotal: number
  /** Avanços de anuênio nos próximos 30 dias. */
  anuenios30: number
  niveisTotal: number
  /** Avanços de nível previstos nos próximos 30 dias. */
  niveis30: number
  /** Períodos em aberto com ≤120 dias para o fim do concessivo (ou vencidos). */
  feriasVencendo120: number
  feriasAbertas: number
  /** Gozos futuros ainda sem autorização. */
  gozosAguardando: number
  /** ASOs vigentes vencidos ou vencendo em 90 dias. */
  asoVencendo90: number
  asosTotal: number
  ausentesHoje: number
  atestadosTotal: number
  treinamentosTotal: number
  certificadosVencidos: number
  /** null = tabela ainda não criada (rodar SQL). */
  diariasAguardando: number | null
  reembolsosAguardando: number | null
  reembolsosAPagar: number | null
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export async function resumoPessoal(): Promise<ResumoPessoal> {
  const admin = await createAdminClient()
  const hoje = hojeSP()
  const em30 = somarDias(hoje, 30)
  const em90 = somarDias(hoje, 90)
  const em120 = somarDias(hoje, 120)

  const contar = async (
    montar: () => PromiseLike<{ count: number | null; error: { code?: string } | null }>
  ): Promise<number | null> => {
    const { count, error } = await montar()
    if (error) {
      // PGRST205/42P01 = tabela ausente (SQL pendente) — some da UI.
      if (["PGRST205", "42P01"].includes(error.code ?? "")) return null
      return 0
    }
    return count ?? 0
  }

  const empId = await tenantAtual()
  const [
    funcionarios,
    remessasC,
    remessasP,
    remessasI,
    anueniosTotal,
    anuenios30,
    niveisTotal,
    niveis30,
    feriasVencendo,
    feriasAbertas,
    gozosAguardando,
    asoVencendo,
    asosTotal,
    ausentesHoje,
    atestadosTotal,
    treinamentos,
    alunos,
    diariasAguardando,
    reembolsosAguardando,
    reembolsosAPagar,
  ] = await Promise.all([
    listarFuncionarios({ situacao: "ativos" }),
    contar(() =>
      admin
        .from("pessoal_contracheques_remessas")
        .select("id", { count: "exact", head: true })
        .eq("emp_proprietaria_id", empId)
        .not("finalizada", "is", true)
    ),
    contar(() =>
      admin
        .from("pessoal_registro_ponto_remessas")
        .select("id", { count: "exact", head: true })
        .not("finalizada", "is", true)
    ),
    contar(() =>
      admin
        .from("pessoal_informes_rendimentos_remessas")
        .select("id", { count: "exact", head: true })
        .eq("emp_proprietaria_id", empId)
        .not("fechada", "is", true)
    ),
    contar(() =>
      admin.from("pessoal_anuenio").select("id", { count: "exact", head: true })
    ),
    contar(() =>
      admin
        .from("pessoal_anuenio")
        .select("id", { count: "exact", head: true })
        .gte("proximo_nivel_data", hoje)
        .lte("proximo_nivel_data", em30)
    ),
    contar(() =>
      admin
        .from("pessoal_nivel_salarial")
        .select("id", { count: "exact", head: true })
    ),
    contar(() =>
      admin
        .from("pessoal_nivel_salarial")
        .select("id", { count: "exact", head: true })
        .gte("proximo_nivel_data", hoje)
        .lte("proximo_nivel_data", em30)
    ),
    contar(() =>
      admin
        .from("pessoal_ferias")
        .select("id", { count: "exact", head: true })
        .not("finalizado", "is", true)
        .lte("concessivo_termino", em120)
    ),
    contar(() =>
      admin
        .from("pessoal_ferias")
        .select("id", { count: "exact", head: true })
        .not("finalizado", "is", true)
    ),
    contar(() =>
      admin
        .from("pessoal_ferias_gozo")
        .select("id", { count: "exact", head: true })
        .not("autorizado", "is", true)
        .gte("inicio", hoje)
    ),
    contar(() =>
      admin
        .from("aso")
        .select("id", { count: "exact", head: true })
        .is("ultimo", true)
        .lte("vencimento", em90)
    ),
    contar(() =>
      admin.from("aso").select("id", { count: "exact", head: true })
    ),
    contar(() =>
      admin
        .from("pessoal_ausencias")
        .select("id", { count: "exact", head: true })
        .lte("inicio", hoje)
        .gte("termino", hoje)
    ),
    contar(() =>
      admin
        .from("pes_atestados_medicos")
        .select("id", { count: "exact", head: true })
    ),
    admin
      .from("pessoal_treinamentos")
      .select("id, vencimento_meses"),
    admin
      .from("pessoal_treinamentos_alunos")
      .select("treinamento_id, data_termino"),
    // Tabelas que podem não existir (SQL pendente): GET com limit(1) em vez
    // de head — requisição HEAD não tem corpo e o código PGRST205 se perde.
    contar(() =>
      admin
        .from("pessoal_diarias_solicitacoes")
        .select("id", { count: "exact" })
        .eq("situacao", "aguardando")
        .limit(1)
    ),
    contar(() =>
      admin
        .from("pessoal_reembolsos_act")
        .select("id", { count: "exact" })
        .eq("situacao", "aguardando")
        .limit(1)
    ),
    contar(() =>
      admin
        .from("pessoal_reembolsos_act")
        .select("id", { count: "exact" })
        .eq("situacao", "aprovado")
        .limit(1)
    ),
  ])

  // Certificados vencidos: validade = data_termino + vencimento_meses do tipo.
  const validadePorTreinamento = new Map(
    (treinamentos.data ?? []).map((t) => [t.id, t.vencimento_meses])
  )
  let certificadosVencidos = 0
  for (const a of alunos.data ?? []) {
    const meses = a.treinamento_id
      ? validadePorTreinamento.get(a.treinamento_id)
      : null
    if (a.data_termino && meses && somarMeses(a.data_termino, meses) < hoje) {
      certificadosVencidos++
    }
  }

  return {
    funcionariosAtivos: funcionarios.ativos,
    remessasContrachequesAbertas: remessasC ?? 0,
    remessasPontoAbertas: remessasP ?? 0,
    informesRemessasAbertas: remessasI ?? 0,
    anueniosTotal: anueniosTotal ?? 0,
    anuenios30: anuenios30 ?? 0,
    niveisTotal: niveisTotal ?? 0,
    niveis30: niveis30 ?? 0,
    feriasVencendo120: feriasVencendo ?? 0,
    feriasAbertas: feriasAbertas ?? 0,
    gozosAguardando: gozosAguardando ?? 0,
    asoVencendo90: asoVencendo ?? 0,
    asosTotal: asosTotal ?? 0,
    ausentesHoje: ausentesHoje ?? 0,
    atestadosTotal: atestadosTotal ?? 0,
    treinamentosTotal: (treinamentos.data ?? []).length,
    certificadosVencidos,
    diariasAguardando,
    reembolsosAguardando,
    reembolsosAPagar,
  }
}
