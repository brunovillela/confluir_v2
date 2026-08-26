import "server-only"
import { hojeSP, nomesDosUsuarios } from "@/lib/db/comum"

import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarPushTelegram } from "@/lib/db/telegram"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Treinamentos — catálogo (`pessoal_treinamentos`, 3 migrados: nome, carga
 * horária, validade em meses) e turmas/alunos
 * (`pessoal_treinamentos_alunos`, 20: aluno → usuarios, período,
 * certificado). Validade do certificado = data_termino + vencimento_meses
 * (sem vencimento_meses o treinamento não expira).
 *
 * Certificados novos vão ao bucket privado 'pessoal'
 * (treinamentos/<treinamento>/); legados são URLs //cdn do Bubble.
 */

export type Treinamento = {
  id: string
  treinamento: string | null
  carga_horaria: number | null
  vencimento_meses: number | null
  created_at: string | null
  alunos: number
}

export type AlunoTreinamento = {
  id: string
  aluno_id: string | null
  alunoNome: string | null
  treinamento_id: string | null
  data_inicio: string | null
  data_termino: string | null
  certificado_url: string | null
  /** Validade do certificado (null = não expira). */
  valido_ate: string | null
  vencido: boolean
  created_at: string | null
}

/** data ISO + n meses (fim de mês seguro: 31/01 + 1 mês → 28/02 ou 29/02). */
export function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number)
  const d = new Date(Date.UTC(ano, mes - 1 + meses, dia))
  if (d.getUTCDate() !== dia) d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

/**
 * Avisa o funcionário matriculado: notificação in-app (sino) + push do Telegram.
 * Treinamentos não tinham aviso; entrou junto com o push (sem e-mail — não havia).
 * Best-effort: nunca derruba a matrícula.
 */
export async function notificarMatriculaTreinamento(
  alunoId: string,
  treinamentoId: string
): Promise<void> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_treinamentos")
    .select("treinamento")
    .eq("id", treinamentoId)
    .maybeSingle()
  const nome = typeof data?.treinamento === "string" ? data.treinamento : null
  const mensagem = `Você foi matriculado ${nome ? `no treinamento ${nome}` : "em um treinamento"}. Veja em Meu perfil → Treinamentos.`
  try {
    await criarNotificacao({ usuarioId: alunoId, texto: mensagem })
  } catch (e) {
    console.error("Falha ao notificar treinamento:", e)
  }
  await enviarPushTelegram(alunoId, mensagem, "treinamento")
}

export async function listarTreinamentos(): Promise<Treinamento[]> {
  const admin = await createAdminClient()
  const [treinamentos, alunos] = await Promise.all([
    admin
      .from("pessoal_treinamentos")
      .select("id, treinamento, carga_horaria, vencimento_meses, created_at")
      .order("treinamento", { ascending: true, nullsFirst: false }),
    admin.from("pessoal_treinamentos_alunos").select("id, treinamento_id"),
  ])
  if (treinamentos.error) {
    throw new Error(`Falha ao listar treinamentos: ${treinamentos.error.message}`)
  }
  if (alunos.error) {
    throw new Error(`Falha ao contar alunos: ${alunos.error.message}`)
  }
  const porTreinamento = new Map<string, number>()
  for (const a of alunos.data ?? []) {
    if (a.treinamento_id) {
      porTreinamento.set(
        a.treinamento_id,
        (porTreinamento.get(a.treinamento_id) ?? 0) + 1
      )
    }
  }
  return (treinamentos.data ?? []).map((t) => ({
    ...t,
    alunos: porTreinamento.get(t.id) ?? 0,
  }))
}

export async function buscarTreinamento(
  id: string
): Promise<Treinamento | null> {
  const treinamentos = await listarTreinamentos()
  return treinamentos.find((t) => t.id === id) ?? null
}

function normalizarAluno(
  a: {
    id: string
    aluno_id: string | null
    treinamento_id: string | null
    data_inicio: string | null
    data_termino: string | null
    certificado_url: string | null
    created_at: string | null
  },
  vencimentoMeses: number | null,
  nomes: Map<string, string>
): AlunoTreinamento {
  const validoAte =
    a.data_termino && vencimentoMeses
      ? somarMeses(a.data_termino, vencimentoMeses)
      : null
  return {
    ...a,
    alunoNome: a.aluno_id ? (nomes.get(a.aluno_id) ?? null) : null,
    valido_ate: validoAte,
    vencido: Boolean(validoAte && validoAte < hojeSP()),
  }
}

export async function alunosDoTreinamento(
  treinamento: Treinamento
): Promise<AlunoTreinamento[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_treinamentos_alunos")
    .select(
      "id, aluno_id, treinamento_id, data_inicio, data_termino, certificado_url, created_at"
    )
    .eq("treinamento_id", treinamento.id)
    .order("data_inicio", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar alunos: ${error.message}`)
  const linhas = data ?? []
  const nomes = await nomesDosUsuarios([
    ...new Set(linhas.map((a) => a.aluno_id).filter((v): v is string => !!v)),
  ])
  return linhas
    .map((a) => normalizarAluno(a, treinamento.vencimento_meses, nomes))
    .sort((a, b) =>
      (a.alunoNome ?? "￿").localeCompare(b.alunoNome ?? "￿", "pt-BR")
    )
}

export type MeuTreinamento = AlunoTreinamento & {
  treinamentoNome: string | null
  carga_horaria: number | null
}

/** Treinamentos do próprio funcionário (autosserviço, somente leitura). */
export async function meusTreinamentos(
  usuarioId: string
): Promise<MeuTreinamento[]> {
  const admin = await createAdminClient()
  const [{ data, error }, treinamentos] = await Promise.all([
    admin
      .from("pessoal_treinamentos_alunos")
      .select(
        "id, aluno_id, treinamento_id, data_inicio, data_termino, certificado_url, created_at"
      )
      .eq("aluno_id", usuarioId)
      .order("data_inicio", { ascending: false, nullsFirst: false }),
    listarTreinamentos(),
  ])
  if (error) {
    throw new Error(`Falha ao listar seus treinamentos: ${error.message}`)
  }
  const porId = new Map(treinamentos.map((t) => [t.id, t]))
  return (data ?? []).map((a) => {
    const t = a.treinamento_id ? porId.get(a.treinamento_id) : undefined
    return {
      ...normalizarAluno(a, t?.vencimento_meses ?? null, new Map()),
      treinamentoNome: t?.treinamento ?? null,
      carga_horaria: t?.carga_horaria ?? null,
    }
  })
}

/** Aluno já matriculado no treinamento (evita duplicidade). */
export async function alunoJaMatriculado(
  treinamentoId: string,
  alunoId: string,
  ignorarId?: string
): Promise<boolean> {
  const admin = await createAdminClient()
  let query = admin
    .from("pessoal_treinamentos_alunos")
    .select("id")
    .eq("treinamento_id", treinamentoId)
    .eq("aluno_id", alunoId)
    .limit(1)
  if (ignorarId) query = query.neq("id", ignorarId)
  const { data } = await query
  return (data ?? []).length > 0
}
