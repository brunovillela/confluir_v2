import "server-only"

import { filiadosAtivos } from "@/lib/db/filiacao-ativos"
import { lerRegrasInadimplencia } from "@/lib/db/filiacao-direitos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Quem está inadimplente, segundo as regras configuradas.
 *
 * O relatório APONTA — não muda a condição de ninguém. Uma remessa que o
 * empregador atrasou faria o sistema tirar direitos de gente em dia, e a
 * pessoa só descobriria ao ser barrada. Quem decide é uma pessoa, com a lista
 * na frente e o efeito suspensivo à mão.
 *
 * Casa por CPF, e não por `filiado_id`: a mesma pessoa tem um registro de
 * filiação por vínculo, e o pagamento pode estar pendurado em qualquer um
 * deles. Casar por id daria falso inadimplente.
 *
 * SQL: supabase/filiacao-carencia-inadimplencia.sql
 */

const VALIDADE_CACHE_MS = 10 * 60 * 1000

export type Inadimplente = {
  cpf: string
  nome: string | null
  matricula: string | null
  tipo: string
  faltas: number
  /** As remessas não pagas, da mais recente para trás. */
  remessasEmFalta: string[]
  ultimoPagamento: string | null
  suspenso: boolean
}

export type RelatorioInadimplencia = {
  /** Nenhuma regra ligada: a tela precisa dizer isso em vez de "ninguém". */
  configurado: boolean
  /** Todos os filiados ativos, tenham CPF ou não. */
  ativos: number
  /**
   * Ativos SEM CPF no cadastro. A remessa identifica quem pagou pelo CPF —
   * quem não tem fica fora da apuração, para sempre, sem aparecer em lista
   * nenhuma. É defeito de cadastro, e a tela precisa dizê-lo.
   */
  semCpf: number
  porTipo: {
    tipo: string
    quantidade: number
    exigirConsecutivas: boolean
    janelaRemessas: number
    remessasNaJanela: string[]
    inadimplentes: number
  }[]
  lista: Inadimplente[]
  suspensos: number
  geradoEm: string
}

let cache: { dados: RelatorioInadimplencia; expira: number } | null = null

export function invalidarCacheInadimplencia() {
  cache = null
}

async function lerLotes<T>(
  consulta: (
    de: number,
    ate: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const LOTE = 1000
  const linhas: T[] = []
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await consulta(de, de + LOTE - 1)
    if (error) throw new Error(`Falha na apuração: ${error.message}`)
    linhas.push(...(data ?? []))
    if (!data || data.length < LOTE) break
  }
  return linhas
}

/** Rótulo humano de uma remessa: "Associativa 05/2026". */
function rotuloRemessa(tipo: string, ordem: number): string {
  const texto = String(ordem)
  return `${tipo} ${texto.slice(4)}/${texto.slice(0, 4)}`
}

export async function relatorioInadimplencia(): Promise<RelatorioInadimplencia> {
  if (cache && cache.expira > Date.now()) return cache.dados

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const regras = (await lerRegrasInadimplencia()).filter((r) => r.ativo)

  // ── Quem são os ativos (a régua mora em filiacao-ativos.ts) ───────────────
  const ativos = await filiadosAtivos()
  const cpfsAtivos = new Set<string>()
  for (const f of ativos.values()) if (f.cpf) cpfsAtivos.add(f.cpf)

  const semCpf = ativos.size - cpfsAtivos.size
  const vazio: RelatorioInadimplencia = {
    configurado: regras.length > 0,
    // Mesmo sem regra a tela mostra o universo: dizer "0 filiados ativos"
    // seria informação falsa em vez de ausência de configuração.
    ativos: ativos.size,
    semCpf,
    porTipo: [],
    lista: [],
    suspensos: 0,
    geradoEm: new Date().toISOString(),
  }
  if (regras.length === 0) {
    cache = { dados: vazio, expira: Date.now() + VALIDADE_CACHE_MS }
    return vazio
  }

  // ── Remessas e quem pagou cada uma ────────────────────────────────────────
  const { data: remessasBrutas } = await admin
    .from("filiacao_recebe_remessa")
    .select("id, tipo, ordem")
    .eq("emp_proprietaria_id", emp)
    .not("ordem", "is", null)
    .order("ordem", { ascending: false })

  // O CPF não vem nas linhas de recebimento do tenant real (a coluna está
  // nula nas 609.967) — quem identifica a pessoa ali é o `filiado_id`. Este
  // mapa cobre TODOS os cadastros, não só os ativos: uma linha de remessa
  // pode ser de quem já saiu, e ignorá-la mudaria a conta de faltas.
  const cpfPorId = new Map<string, string>()
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("filiacoes")
      .select("id, cpf")
      .eq("emp_proprietaria_id", emp)
      .not("cpf", "is", null)
      .order("id", { ascending: true })
      .range(de, de + 999)
    if (error) throw new Error(`Falha ao ler cadastros: ${error.message}`)
    for (const f of data ?? []) cpfPorId.set(f.id as string, f.cpf as string)
    if (!data || data.length < 1000) break
  }

  const porTipo: RelatorioInadimplencia["porTipo"] = []
  const faltasPorCpf = new Map<
    string,
    { tipo: string; faltas: number; remessas: string[]; ultimoPagamento: string | null }[]
  >()

  for (const regra of regras) {
    const daJanela = (remessasBrutas ?? [])
      .filter((r) => r.tipo === regra.tipo)
      .slice(0, regra.janelaRemessas)
    if (daJanela.length === 0) {
      porTipo.push({
        tipo: regra.tipo,
        quantidade: regra.quantidade,
        exigirConsecutivas: regra.exigirConsecutivas,
        janelaRemessas: regra.janelaRemessas,
        remessasNaJanela: [],
        inadimplentes: 0,
      })
      continue
    }

    // Um conjunto de CPFs pagantes por remessa, da mais recente para trás.
    const pagantes: Set<string>[] = []
    for (const r of daJanela) {
      const cpfs = new Set<string>()
      const linhas = await lerLotes<{ cpf: string | null; filiado_id: string | null }>(
        (de, ate) =>
          admin
            .from("filiacao_recebe")
            .select("cpf, filiado_id")
            .eq("remessa_id", r.id as string)
            .order("id", { ascending: true })
            .range(de, ate)
      )
      for (const l of linhas) {
        const cpf =
          l.cpf ?? (l.filiado_id ? (cpfPorId.get(l.filiado_id) ?? null) : null)
        if (cpf) cpfs.add(cpf)
      }
      pagantes.push(cpfs)
    }

    let inadimplentes = 0
    for (const cpf of cpfsAtivos) {
      // Faltas na ordem da mais recente para trás.
      const faltou = pagantes.map((s) => !s.has(cpf))
      const total = faltou.filter(Boolean).length

      let atinge: boolean
      if (regra.exigirConsecutivas) {
        // Seguidas A PARTIR DA MAIS RECENTE: quem voltou a pagar no mês
        // passado não é inadimplente, mesmo com um buraco antigo.
        let seguidas = 0
        for (const f of faltou) {
          if (!f) break
          seguidas++
        }
        atinge = seguidas >= regra.quantidade
      } else {
        atinge = total >= regra.quantidade
      }
      if (!atinge) continue

      inadimplentes++
      const remessasEmFalta = daJanela
        .filter((_, i) => faltou[i])
        .map((r) => rotuloRemessa(regra.tipo, Number(r.ordem)))
      const idxPago = faltou.findIndex((f) => !f)
      const lista = faltasPorCpf.get(cpf) ?? []
      lista.push({
        tipo: regra.tipo,
        faltas: regra.exigirConsecutivas
          ? remessasEmFalta.length
          : total,
        remessas: remessasEmFalta,
        ultimoPagamento:
          idxPago >= 0
            ? rotuloRemessa(regra.tipo, Number(daJanela[idxPago].ordem))
            : null,
      })
      faltasPorCpf.set(cpf, lista)
    }

    porTipo.push({
      tipo: regra.tipo,
      quantidade: regra.quantidade,
      exigirConsecutivas: regra.exigirConsecutivas,
      janelaRemessas: regra.janelaRemessas,
      remessasNaJanela: daJanela.map((r) =>
        rotuloRemessa(regra.tipo, Number(r.ordem))
      ),
      inadimplentes,
    })
  }

  // ── Efeito suspensivo ─────────────────────────────────────────────────────
  const { data: suspensoes } = await admin
    .from("filiacao_suspensoes")
    .select("cpf, alvo, vigencia_ate")
    .eq("emp_proprietaria_id", emp)
    .eq("escopo", "inadimplencia")
    .is("revogada_em", null)

  const hoje = new Date().toISOString().slice(0, 10)
  const suspensosPorCpf = new Map<string, Set<string | null>>()
  for (const s of suspensoes ?? []) {
    if (s.vigencia_ate && (s.vigencia_ate as string) < hoje) continue
    const cpf = s.cpf as string
    const alvos = suspensosPorCpf.get(cpf) ?? new Set()
    alvos.add((s.alvo as string | null) ?? null)
    suspensosPorCpf.set(cpf, alvos)
  }

  // Nome e matrícula só de quem entra na lista.
  const nomePorCpf = new Map<string, { nome: string | null; matricula: string | null }>()
  for (const f of ativos.values()) {
    if (!f.cpf || !faltasPorCpf.has(f.cpf)) continue
    if (!nomePorCpf.has(f.cpf) && f.nome) {
      nomePorCpf.set(f.cpf, { nome: f.nome, matricula: f.matricula })
    }
  }

  const lista: Inadimplente[] = []
  for (const [cpf, entradas] of faltasPorCpf) {
    const alvos = suspensosPorCpf.get(cpf)
    for (const e of entradas) {
      const suspenso = Boolean(
        alvos && (alvos.has(null) || alvos.has(e.tipo))
      )
      lista.push({
        cpf,
        nome: nomePorCpf.get(cpf)?.nome ?? null,
        matricula: nomePorCpf.get(cpf)?.matricula ?? null,
        tipo: e.tipo,
        faltas: e.faltas,
        remessasEmFalta: e.remessas,
        ultimoPagamento: e.ultimoPagamento,
        suspenso,
      })
    }
  }
  lista.sort(
    (a, b) =>
      b.faltas - a.faltas || (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR")
  )

  const dados: RelatorioInadimplencia = {
    configurado: true,
    ativos: ativos.size,
    semCpf,
    porTipo,
    lista,
    suspensos: lista.filter((l) => l.suspenso).length,
    geradoEm: new Date().toISOString(),
  }
  cache = { dados, expira: Date.now() + VALIDADE_CACHE_MS }
  return dados
}
