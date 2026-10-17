import "server-only"

import { cache } from "react"

import { hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import { matrizTreinamento, type LinhaMatriz } from "@/lib/db/pessoal-sst"
import { listarTreinamentos, somarMeses } from "@/lib/db/treinamentos"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Base da área Treinamentos no padrão de 3 níveis (lib/pessoal-area.ts): as
 * matrículas de todos os funcionários (com a validade do certificado) e, se a
 * entidade usa Atribuições e SST, os treinamentos EXIGIDOS de cada um (matriz).
 */
export type Matricula = {
  id: string
  alunoId: string
  treinamentoId: string
  treinamento: string
  cargaHoraria: number | null
  inicio: string | null
  termino: string | null
  certificado: string | null
  validoAte: string | null
  vencido: boolean
}

export const carregarBaseTreinamentos = cache(async () => {
  const [treinamentos, matriz] = await Promise.all([
    listarTreinamentos(),
    matrizTreinamento().catch(() => [] as LinhaMatriz[]),
  ])
  const porId = new Map(treinamentos.map((t) => [t.id, t]))
  const admin = await createAdminClient()
  const brutos = await lerEmLotes((de, ate) =>
    admin
      .from("pessoal_treinamentos_alunos")
      .select("id, aluno_id, treinamento_id, data_inicio, data_termino, certificado_url")
      .order("id")
      .range(de, ate)
  )
  const hoje = hojeSP()
  const matriculas: Matricula[] = []
  for (const b of brutos) {
    const t = porId.get(String(b.treinamento_id))
    const aluno = texto(b.aluno_id)
    if (!t || !aluno) continue
    const termino = texto(b.data_termino)
    const validoAte = termino && t.vencimento_meses ? somarMeses(termino, t.vencimento_meses) : null
    matriculas.push({
      id: String(b.id),
      alunoId: aluno,
      treinamentoId: t.id,
      treinamento: t.treinamento ?? "(sem nome)",
      cargaHoraria: t.carga_horaria,
      inicio: texto(b.data_inicio),
      termino,
      certificado: texto(b.certificado_url),
      validoAte,
      vencido: Boolean(validoAte && validoAte < hoje),
    })
  }
  matriculas.sort((a, b) => (b.inicio ?? "").localeCompare(a.inicio ?? ""))
  const matrizDe = new Map(matriz.map((l) => [l.funcionarioId, l]))
  return { treinamentos, matriculas, matrizDe, usaMatriz: matriz.length > 0 }
})
