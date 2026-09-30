import "server-only"

import { lerEmLotes } from "@/lib/db/comum"
import { listarCondutores } from "@/lib/db/veiculos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Relatório de abastecimento lido pela IA (fatura do cartão-combustível,
 * extrato do posto, cupom): as linhas extraídas são casadas com a frota e os
 * condutores e conferidas contra o que já está lançado ANTES de gravar. Todas
 * entram — a de placa fora da frota fica sem veículo, com a placa informada
 * guardada para vincular depois (supabase/abastecimentos-nao-identificados.sql).
 */

/** Uma linha como a IA leu, já higienizada. */
export type ItemAbastecimento = {
  placa: string | null
  /** YYYY-MM-DD */
  data: string
  /** HH:MM ou null (sem hora no relatório → 12:00). */
  hora: string | null
  posto: string | null
  cidade: string | null
  combustivel: string | null
  litros: number
  valor: number
  hodometro: number | null
  /** Nome do motorista como veio no relatório. */
  condutor: string | null
}

/** ok e sem_veiculo são gravados; duplicado e repetido ficam de fora. */
export type SituacaoLinha = "ok" | "sem_veiculo" | "duplicado" | "repetido"

export type LinhaResolvida = ItemAbastecimento & {
  veiculoId: string | null
  veiculoRotulo: string | null
  condutorId: string | null
  condutorNome: string | null
  situacao: SituacaoLinha
  /** Pontos a conferir que não impedem o lançamento. */
  alertas: string[]
}

// ── Placa ───────────────────────────────────────────────────────────────────

const MERCOSUL = /^[A-Z]{3}\d[A-Z]\d{2}$/

/**
 * Chave de comparação da placa: só letras e dígitos, e a Mercosul convertida
 * para o formato antigo (5º caractere A–J ↔ 0–9) — a fatura pode trazer uma
 * forma e o cadastro a outra.
 */
export function chavePlaca(placa: string | null | undefined): string {
  const p = (placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (MERCOSUL.test(p)) return p.slice(0, 4) + String(p.charCodeAt(4) - 65) + p.slice(5)
  return p
}

// ── Condutor ────────────────────────────────────────────────────────────────

function palavras(nome: string): string[] {
  return semAcento(nome)
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 0 && !["de", "da", "do", "das", "dos", "e"].includes(p))
}

/** Distância de edição (Levenshtein) — nomes curtos, custo irrelevante. */
function distancia(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    anterior = atual
  }
  return anterior[b.length]
}

/** 2 = igual; 1 = inicial ("M" → Moreira) ou uma letra de diferença (Cotrin → Cotrim); 0 = não. */
function palavraCasa(r: string, c: string): number {
  if (r === c) return 2
  if (r.length === 1) return c.startsWith(r) ? 1 : 0
  if (r.length >= 4 && c.length >= 4 && distancia(r, c) <= 1) return 1
  return 0
}

/**
 * O nome do relatório casa com o do cadastro quando o primeiro nome é igual,
 * o último bate e todas as palavras aparecem, na ordem, no nome completo —
 * cada uma igual, abreviada pela inicial ou com uma letra de diferença
 * (Eider Cotrin M de Siqueira → Eider Cotrim Moreira de Siqueira). Devolve a
 * pontuação (palavras iguais valem mais) ou -1.
 */
function pontuarNome(relatorio: string[], cadastro: string[]): number {
  if (relatorio.length === 0 || cadastro.length === 0) return -1
  // Primeiro nome sempre por inteiro e igual: Maria ≠ Mario, Paulo ≠ Paula.
  if (relatorio[0] !== cadastro[0]) return -1
  if (
    relatorio.length > 1 &&
    !palavraCasa(relatorio[relatorio.length - 1], cadastro[cadastro.length - 1])
  ) {
    return -1
  }
  let j = 0
  let pontos = 0
  for (const r of relatorio) {
    while (j < cadastro.length && !palavraCasa(r, cadastro[j])) j++
    if (j >= cadastro.length) return -1
    pontos += palavraCasa(r, cadastro[j])
    j++
  }
  return pontos
}

/**
 * Casa o nome do relatório com UMA pessoa. Só o primeiro nome casa apenas se
 * for único. Empate na melhor pontuação → não casa (melhor deixar sem
 * condutor do que errar) — inclusive duas contas com o mesmo nome.
 */
export function casarCondutor(
  nome: string | null,
  pessoas: { id: string; nome: string }[]
): { id: string; nome: string } | null {
  if (!nome?.trim()) return null
  const alvo = palavras(nome)
  if (alvo.length === 0) return null
  const pontuadas = pessoas
    .map((p) => ({ p, pontos: pontuarNome(alvo, palavras(p.nome)) }))
    .filter((x) => x.pontos >= 0)
  if (pontuadas.length === 0) return null
  if (alvo.length < 2) return pontuadas.length === 1 ? pontuadas[0].p : null
  const melhor = Math.max(...pontuadas.map((x) => x.pontos))
  const topo = pontuadas.filter((x) => x.pontos === melhor)
  return topo.length === 1 ? topo[0].p : null
}

// ── Resolução ───────────────────────────────────────────────────────────────

function diaSP(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(ts))
}

function chaveDuplicidade(alvo: string, dia: string, valor: number, litros: number): string {
  return `${alvo}|${dia}|${valor.toFixed(2)}|${litros.toFixed(2)}`
}

/** Sem veículo, o "alvo" da duplicidade é a placa informada. */
const alvoDaPlaca = (placa: string | null | undefined) => `placa:${chavePlaca(placa)}`

/**
 * Casa placa e condutor, marca o que já está lançado (mesmo veículo — ou mesma
 * placa informada —, dia, valor e litros) ou repetido no próprio arquivo e
 * aponta leituras suspeitas (preço por litro fora da faixa, hodômetro abaixo
 * do último registrado).
 */
export async function resolverAbastecimentos(
  itens: ItemAbastecimento[],
  veiculoPadraoId: string | null
): Promise<LinhaResolvida[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [{ data: frota }, { condutores }] = await Promise.all([
    admin
      .from("veiculos")
      .select("id, placa, marca_modelo, inativo")
      .eq("emp_proprietaria_id", emp),
    listarCondutores().catch(() => ({ condutores: [] as { usuario_id: string; usuarioNome: string | null }[] })),
  ])
  const veiculos = (frota ?? []) as { id: string; placa: string | null; marca_modelo: string | null; inativo: boolean | null }[]
  const porPlaca = new Map(veiculos.filter((v) => v.placa).map((v) => [chavePlaca(v.placa), v]))
  const porId = new Map(veiculos.map((v) => [v.id, v]))
  const listaCondutores = condutores
    .filter((c) => c.usuarioNome)
    .map((c) => ({ id: c.usuario_id, nome: c.usuarioNome as string }))

  // Quem não está entre os condutores ainda pode ser um usuário (diretor,
  // funcionário) — segunda tentativa, só quando a primeira não acha.
  let listaUsuarios: { id: string; nome: string }[] | null = null
  const usuarios = async () => {
    if (listaUsuarios) return listaUsuarios
    const { data } = await admin
      .from("usuarios")
      .select("id, nome_completo, inativo, deletado")
      .eq("emp_proprietaria_id", emp)
    listaUsuarios = ((data ?? []) as Record<string, unknown>[])
      .filter((u) => u.nome_completo && u.inativo !== true && u.deletado !== true)
      .map((u) => ({ id: String(u.id), nome: String(u.nome_completo) }))
    return listaUsuarios
  }

  const padrao = veiculoPadraoId ? (porId.get(veiculoPadraoId) ?? null) : null
  const base: {
    item: ItemAbastecimento
    veiculo: (typeof veiculos)[number] | null
    condutor: { id: string; nome: string } | null
  }[] = []
  for (const i of itens) {
    const veiculo = i.placa ? (porPlaca.get(chavePlaca(i.placa)) ?? null) : padrao
    let condutor = casarCondutor(i.condutor, listaCondutores)
    if (!condutor && i.condutor) condutor = casarCondutor(i.condutor, await usuarios())
    base.push({ item: i, veiculo, condutor })
  }

  // Já lançados e hodômetros dos veículos envolvidos.
  const existentes = new Set<string>()
  const hodometros = new Map<string, { dia: string; km: number }[]>()
  const registrarExistentes = (linhas: Record<string, unknown>[]) => {
    for (const l of linhas) {
      if (!l.data_hora_abastecimento) continue
      const alvo = l.veiculo_id ? String(l.veiculo_id) : alvoDaPlaca(l.placa_informada as string | null)
      const dia = diaSP(String(l.data_hora_abastecimento))
      const valor = Number(l.valor_abastecimento)
      const litros = Number(l.volume_abastecido)
      if (valor > 0 && litros > 0) existentes.add(chaveDuplicidade(alvo, dia, valor, litros))
      const km = l.hodometro === null || l.hodometro === undefined ? null : Number(l.hodometro)
      if (km !== null && km > 0 && l.veiculo_id) {
        if (!hodometros.has(alvo)) hodometros.set(alvo, [])
        hodometros.get(alvo)!.push({ dia, km })
      }
    }
  }
  const ids = [...new Set(base.map((b) => b.veiculo?.id).filter((v): v is string => !!v))]
  if (ids.length) {
    registrarExistentes(
      await lerEmLotes<Record<string, unknown>>((de, ate) =>
        admin
          .from("veiculos_abastecimentos")
          .select("veiculo_id, data_hora_abastecimento, valor_abastecimento, volume_abastecido, hodometro")
          .in("veiculo_id", ids)
          .order("id")
          .range(de, ate)
      ).catch(() => [])
    )
  }
  // Lançados antes sem veículo (placa fora da frota): casam pela placa informada.
  const placasSemVeiculo = [
    ...new Set(base.filter((b) => !b.veiculo && b.item.placa).map((b) => b.item.placa as string)),
  ]
  if (placasSemVeiculo.length) {
    registrarExistentes(
      await lerEmLotes<Record<string, unknown>>((de, ate) =>
        admin
          .from("veiculos_abastecimentos")
          .select("veiculo_id, placa_informada, data_hora_abastecimento, valor_abastecimento, volume_abastecido, hodometro")
          .eq("emp_proprietaria_id", emp)
          .is("veiculo_id", null)
          .in("placa_informada", placasSemVeiculo)
          .order("id")
          .range(de, ate)
      ).catch(() => [])
    )
  }

  const noArquivo = new Set<string>()
  return base.map(({ item, veiculo, condutor }) => {
    const alertas: string[] = []
    const alvo = veiculo ? veiculo.id : alvoDaPlaca(item.placa)
    const chave = chaveDuplicidade(alvo, item.data, item.valor, item.litros)
    let situacao: SituacaoLinha = veiculo ? "ok" : "sem_veiculo"
    if (existentes.has(chave)) situacao = "duplicado"
    else if (noArquivo.has(chave)) situacao = "repetido"
    noArquivo.add(chave)

    if (!veiculo) {
      alertas.push(item.placa ? `placa ${item.placa} fora da frota — vincule o veículo depois` : "sem placa — vincule o veículo depois")
    } else {
      if (veiculo.inativo) alertas.push("veículo inativo")
      if (item.hodometro !== null) {
        const anteriores = (hodometros.get(veiculo.id) ?? []).filter((h) => h.dia < item.data)
        const maior = anteriores.reduce((m, h) => Math.max(m, h.km), 0)
        if (maior > 0 && item.hodometro < maior) {
          alertas.push(`hodômetro abaixo do último registrado (${maior.toLocaleString("pt-BR")} km)`)
        }
      }
    }
    const precoLitro = item.valor / item.litros
    if (precoLitro < 3 || precoLitro > 15) {
      alertas.push(`R$ ${precoLitro.toFixed(2).replace(".", ",")}/litro — confira litros e valor`)
    }
    if (item.condutor && !condutor) alertas.push(`condutor "${item.condutor}" não identificado — fica guardado para vincular`)
    return {
      ...item,
      veiculoId: veiculo?.id ?? null,
      veiculoRotulo: veiculo ? `${veiculo.placa ?? "s/ placa"}${veiculo.marca_modelo ? ` — ${veiculo.marca_modelo}` : ""}` : null,
      condutorId: condutor?.id ?? null,
      condutorNome: condutor?.nome ?? null,
      situacao,
      alertas,
    }
  })
}
