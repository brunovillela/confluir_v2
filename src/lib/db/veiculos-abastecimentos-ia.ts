import "server-only"

import { lerEmLotes } from "@/lib/db/comum"
import { listarCondutores } from "@/lib/db/veiculos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Relatório de abastecimento lido pela IA (fatura do cartão-combustível,
 * extrato do posto, cupom): as linhas extraídas são casadas com a frota e os
 * condutores e conferidas contra o que já está lançado ANTES de gravar.
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
    .filter((p) => p.length > 1 && !["de", "da", "do", "das", "dos", "e"].includes(p))
}

/**
 * Casa o nome do relatório com UM condutor: nome igual, ou todas as palavras
 * do relatório no nome do cadastro (relatórios costumam abreviar). Mais de um
 * candidato → não casa (melhor deixar sem condutor do que errar).
 */
export function casarCondutor(
  nome: string | null,
  condutores: { id: string; nome: string }[]
): { id: string; nome: string } | null {
  if (!nome?.trim()) return null
  const alvo = palavras(nome)
  if (alvo.length === 0) return null
  const exatos = condutores.filter((c) => palavras(c.nome).join(" ") === alvo.join(" "))
  if (exatos.length === 1) return exatos[0]
  if (alvo.length < 2) return null
  const contidos = condutores.filter((c) => {
    const p = palavras(c.nome)
    return alvo.every((a) => p.includes(a))
  })
  return contidos.length === 1 ? contidos[0] : null
}

// ── Resolução ───────────────────────────────────────────────────────────────

function diaSP(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(ts))
}

function chaveDuplicidade(veiculoId: string, dia: string, valor: number, litros: number): string {
  return `${veiculoId}|${dia}|${valor.toFixed(2)}|${litros.toFixed(2)}`
}

/**
 * Casa placa e condutor, marca o que já está lançado (mesmo veículo, dia,
 * valor e litros) ou repetido no próprio arquivo e aponta leituras suspeitas
 * (preço por litro fora da faixa, hodômetro abaixo do último registrado).
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

  const padrao = veiculoPadraoId ? (porId.get(veiculoPadraoId) ?? null) : null
  const base = itens.map((i) => {
    const v = i.placa ? (porPlaca.get(chavePlaca(i.placa)) ?? null) : padrao
    const c = casarCondutor(i.condutor, listaCondutores)
    return { item: i, veiculo: v, condutor: c }
  })

  // Já lançados e hodômetros dos veículos envolvidos.
  const ids = [...new Set(base.map((b) => b.veiculo?.id).filter((v): v is string => !!v))]
  const existentes = new Set<string>()
  const hodometros = new Map<string, { dia: string; km: number }[]>()
  if (ids.length) {
    const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("veiculos_abastecimentos")
        .select("veiculo_id, data_hora_abastecimento, valor_abastecimento, volume_abastecido, hodometro")
        .in("veiculo_id", ids)
        .order("id")
        .range(de, ate)
    ).catch(() => [])
    for (const l of linhas) {
      if (!l.data_hora_abastecimento) continue
      const vid = String(l.veiculo_id)
      const dia = diaSP(String(l.data_hora_abastecimento))
      const valor = Number(l.valor_abastecimento)
      const litros = Number(l.volume_abastecido)
      if (valor > 0 && litros > 0) existentes.add(chaveDuplicidade(vid, dia, valor, litros))
      const km = l.hodometro === null || l.hodometro === undefined ? null : Number(l.hodometro)
      if (km !== null && km > 0) {
        if (!hodometros.has(vid)) hodometros.set(vid, [])
        hodometros.get(vid)!.push({ dia, km })
      }
    }
  }

  const noArquivo = new Set<string>()
  return base.map(({ item, veiculo, condutor }) => {
    const alertas: string[] = []
    let situacao: SituacaoLinha = "ok"
    if (!veiculo) {
      situacao = "sem_veiculo"
    } else {
      const chave = chaveDuplicidade(veiculo.id, item.data, item.valor, item.litros)
      if (existentes.has(chave)) situacao = "duplicado"
      else if (noArquivo.has(chave)) situacao = "repetido"
      noArquivo.add(chave)
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
    if (item.condutor && !condutor) alertas.push(`condutor "${item.condutor}" não identificado`)
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
