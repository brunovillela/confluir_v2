import "server-only"

import { nomesDosUsuarios, texto } from "@/lib/db/comum"
import { vinculoComSindicato } from "@/lib/db/perfil"
import { createAdminClient } from "@/lib/supabase/admin"
import { semAcento } from "@/lib/texto"

/**
 * Quem, na diretoria, pode receber diária — e por qual departamento.
 *
 * O departamento sai, nesta ordem: da lista de pessoas do departamento
 * (empresa_departamentos_integrantes), de ser coordenador dele, ou do próprio
 * CARGO, que na entidade já nomeia a área ("Diretor do Departamento de
 * Formação"). Isso importa porque é o departamento que dá a conta contábil:
 * "Deslocamento Diretores" existe repetido em cada área do plano de contas.
 */

export type DiretorParaDiaria = {
  usuarioId: string
  nome: string
  cargo: string | null
  departamentoId: string | null
  departamentoNome: string | null
}

export async function diretoresParaDiaria(): Promise<DiretorParaDiaria[]> {
  const admin = await createAdminClient()
  const { data: mandatos } = await admin
    .from("diretoria_mandatos")
    .select("id, data_inicio, data_termino")
    .order("data_inicio", { ascending: false })
  const hoje = new Date().toISOString().slice(0, 10)
  const vigente =
    (mandatos ?? []).find(
      (m) =>
        (!m.data_inicio || String(m.data_inicio) <= hoje) &&
        (!m.data_termino || String(m.data_termino) >= hoje)
    ) ?? (mandatos ?? [])[0]
  if (!vigente) return []

  const { data: integrantes, error } = await admin
    .from("diretoria_integrantes")
    .select("usuario_id, nome, cargo, situacao")
    .eq("mandato_id", vigente.id)
    .order("nome", { ascending: true })
  if (error) return []

  const emExercicio = (integrantes ?? []).filter(
    (i) => i.usuario_id && i.situacao !== "excluido"
  )
  if (emExercicio.length === 0) return []

  const usuarioIds = [...new Set(emExercicio.map((i) => String(i.usuario_id)))]
  const [nomes, deptos] = await Promise.all([
    nomesDosUsuarios(usuarioIds),
    departamentosDosUsuarios(usuarioIds),
  ])

  const vistos = new Set<string>()
  const lista: DiretorParaDiaria[] = []
  for (const i of emExercicio) {
    const usuarioId = String(i.usuario_id)
    if (vistos.has(usuarioId)) continue
    vistos.add(usuarioId)
    const doCadastro = deptos.mapa.get(usuarioId) ?? null
    const doCargo = doCadastro ? null : departamentoDoCargo(texto(i.cargo), deptos.lista)
    const escolhido = doCadastro ?? doCargo
    lista.push({
      usuarioId,
      nome: nomes.get(usuarioId) ?? texto(i.nome) ?? "(sem nome)",
      cargo: texto(i.cargo),
      departamentoId: escolhido?.id ?? null,
      departamentoNome: escolhido?.nome ?? null,
    })
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

type DepartamentoSimples = { id: string; nome: string }

/** Departamento de cada usuário: pela lista de pessoas ou por ser coordenador. */
async function departamentosDosUsuarios(usuarioIds: string[]): Promise<{
  mapa: Map<string, DepartamentoSimples>
  lista: DepartamentoSimples[]
}> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa_departamentos")
    .select("id, departamento, coordenador_id, legado")
  const ativos = ((data ?? []) as Record<string, unknown>[]).filter((d) => d.legado !== true)
  const lista = ativos.map((d) => ({
    id: String(d.id),
    nome: String(d.departamento ?? "(sem nome)"),
  }))
  const porId = new Map(lista.map((d) => [d.id, d]))
  const mapa = new Map<string, DepartamentoSimples>()
  for (const d of ativos) {
    const coordenador = texto(d.coordenador_id)
    if (coordenador && usuarioIds.includes(coordenador)) {
      mapa.set(coordenador, porId.get(String(d.id))!)
    }
  }
  const { data: membros } = await admin
    .from("empresa_departamentos_integrantes")
    .select("departamento_id, usuario_id")
    .in("usuario_id", usuarioIds)
  for (const m of (membros ?? []) as Record<string, unknown>[]) {
    const usuario = String(m.usuario_id)
    const depto = porId.get(String(m.departamento_id))
    if (depto && !mapa.has(usuario)) mapa.set(usuario, depto)
  }
  return { mapa, lista }
}

/** "Diretor do Departamento de Formação" → o departamento Formação. */
export function departamentoDoCargo(
  cargo: string | null,
  departamentos: DepartamentoSimples[]
): DepartamentoSimples | null {
  if (!cargo) return null
  const alvo = semAcento(cargo)
  // Do nome mais longo para o mais curto: "Financeiro" não pode ganhar de
  // "Segurança e Saúde do Trabalhador e de Meio Ambiente" por acaso.
  const ordenados = [...departamentos].sort((a, b) => b.nome.length - a.nome.length)
  return ordenados.find((d) => alvo.includes(semAcento(d.nome))) ?? null
}

/**
 * Em que condição a pessoa pede diária: funcionário com vínculo em vigor ou
 * diretor em exercício. Nulo = não pode pedir. Funcionário ganha quando é os
 * dois (não há esse caso hoje, mas a conta do RH é a mais restrita).
 */
export async function quadroParaDiaria(
  usuarioId: string
): Promise<{ quadro: "funcionario" | "diretor"; departamentoId: string | null } | null> {
  if ((await vinculoComSindicato(usuarioId)).ativo) {
    return { quadro: "funcionario", departamentoId: null }
  }
  const diretor = (await diretoresParaDiaria()).find((d) => d.usuarioId === usuarioId)
  return diretor ? { quadro: "diretor", departamentoId: diretor.departamentoId } : null
}
