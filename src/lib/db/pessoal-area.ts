import "server-only"

import { cache } from "react"

import { departamentosPorUsuario } from "@/lib/db/departamentos"
import { listarFuncionarios } from "@/lib/db/pessoal"
import type { FuncionarioBasico } from "@/lib/pessoal-area"

/**
 * Base da lista de funcionários das áreas do Pessoal (lib/pessoal-area.ts):
 * uma linha por pessoa — ativos e desligados; o filtro é da tela — com o
 * departamento do cadastro de departamentos (sem ele, a lotação do vínculo).
 * Cada área junta as próprias colunas por `usuarioId`.
 */
export type FuncionarioArea = FuncionarioBasico & {
  lotacao: string | null
  admissao: string | null
  demissao: string | null
}

export const funcionariosDaArea = cache(async (): Promise<FuncionarioArea[]> => {
  const { linhas } = await listarFuncionarios({ situacao: "todos" })
  const deps = await departamentosPorUsuario(linhas.map((l) => l.usuarioId))
  return linhas.map((l) => ({
    usuarioId: l.usuarioId,
    nome: l.nome ?? "(sem nome)",
    matricula: l.matricula,
    cargo: l.cargo,
    lotacao: l.lotacao,
    departamento: deps.get(l.usuarioId)?.[0] ?? l.lotacao ?? null,
    ativo: !l.contrato_demissao,
    admissao: l.contrato_admissao,
    demissao: l.contrato_demissao,
  }))
})

export async function funcionarioDaArea(usuarioId: string): Promise<FuncionarioArea | null> {
  return (await funcionariosDaArea()).find((f) => f.usuarioId === usuarioId) ?? null
}

/** Departamentos presentes na lista, para o filtro. */
export function departamentosDaLista(linhas: FuncionarioArea[]): string[] {
  return [...new Set(linhas.map((l) => l.departamento).filter((d): d is string => Boolean(d)))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  )
}
