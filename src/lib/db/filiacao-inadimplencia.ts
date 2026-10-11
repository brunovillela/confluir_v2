import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { hojeSP } from "@/lib/db/comum"
import { CONDICAO_ATIVO, filiadosAtivos } from "@/lib/db/filiacao-ativos"
import { lerRegrasInadimplencia } from "@/lib/db/filiacao-direitos"
import type { RegraInadimplencia } from "@/lib/filiacao-direitos-constantes"
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

/**
 * Um relatório por entidade: o mesmo processo atende vários subdomínios, e
 * um cache só devolvia a lista de uma entidade para quem abrisse a tela na
 * outra.
 */
const cache = new Map<string, { dados: RelatorioInadimplencia; expira: number }>()

/**
 * Com o tenant, descarta só o relatório dele. Sem (ticks e baixas que rodam
 * fora de uma requisição e não sabem dizer de quem é a mudança), descarta
 * todos — recalcular sai mais barato que mostrar dado velho.
 */
export function invalidarCacheInadimplencia(tenantId?: string) {
  if (tenantId) cache.delete(tenantId)
  else cache.clear()
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

type RemessaDaJanela = { id: string; tipo: string | null; ordem: number }

/**
 * As remessas que entram na conta, da mais recente para trás. A competência
 * corrente e as futuras ficam FORA: o desconto do mês só chega depois da
 * folha, e a baixa de um Pix cria a remessa da competência adiantada
 * (cobrancas.ts) — contá-las punha quase todo mundo em falta no começo de
 * cada mês. O `id` desempata remessas da mesma competência (a do Pix e a das
 * fontes), para a janela não mudar de uma leitura para outra.
 *
 * Relatório e apuração por CPF usam esta MESMA lista — é o que garante que
 * os dois dão o mesmo veredito.
 */
async function remessasQueContam(admin: SupabaseClient, emp: string): Promise<RemessaDaJanela[]> {
  const hoje = hojeSP()
  const ordemHoje = Number(hoje.slice(0, 4)) * 100 + Number(hoje.slice(5, 7))
  const linhas = await lerLotes<{ id: string; tipo: string | null; ordem: number }>((de, ate) =>
    admin
      .from("filiacao_recebe_remessa")
      .select("id, tipo, ordem")
      .eq("emp_proprietaria_id", emp)
      .not("ordem", "is", null)
      .lt("ordem", ordemHoje)
      .order("ordem", { ascending: false })
      .order("id", { ascending: true })
      .range(de, ate)
  )
  return linhas.map((r) => ({ id: String(r.id), tipo: r.tipo ?? null, ordem: Number(r.ordem) }))
}

type Apuracao = { faltas: number; remessas: string[]; ultimoPagamento: string | null }

/**
 * A regra aplicada às faltas de UMA pessoa (`faltou[i]` = não pagou
 * `daJanela[i]`, da mais recente para trás). Null = não entra na lista.
 */
function aplicarRegra(
  regra: RegraInadimplencia,
  daJanela: RemessaDaJanela[],
  faltou: boolean[]
): Apuracao | null {
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
  if (!atinge) return null

  const remessasEmFalta = daJanela
    .filter((_, i) => faltou[i])
    .map((r) => rotuloRemessa(regra.tipo, Number(r.ordem)))
  const idxPago = faltou.findIndex((f) => !f)
  return {
    faltas: regra.exigirConsecutivas ? remessasEmFalta.length : total,
    remessas: remessasEmFalta,
    ultimoPagamento:
      idxPago >= 0 ? rotuloRemessa(regra.tipo, Number(daJanela[idxPago].ordem)) : null,
  }
}

/** Suspensões vigentes por CPF; `null` no alvo = todos os tipos de remessa. */
function suspensoesVigentes(
  linhas: { cpf: unknown; alvo: unknown; vigencia_ate: unknown }[]
): Map<string, Set<string | null>> {
  const hoje = hojeSP()
  const porCpf = new Map<string, Set<string | null>>()
  for (const s of linhas) {
    if (s.vigencia_ate && (s.vigencia_ate as string) < hoje) continue
    const cpf = s.cpf as string
    const alvos = porCpf.get(cpf) ?? new Set()
    alvos.add((s.alvo as string | null) ?? null)
    porCpf.set(cpf, alvos)
  }
  return porCpf
}

function ordenarLista(lista: Inadimplente[]) {
  lista.sort(
    (a, b) =>
      b.faltas - a.faltas || (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR")
  )
}

export async function relatorioInadimplencia(): Promise<RelatorioInadimplencia> {
  const emp = await tenantAtual()
  const guardado = cache.get(emp)
  if (guardado && guardado.expira > Date.now()) return guardado.dados

  const admin = await createAdminClient()

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
    cache.set(emp, { dados: vazio, expira: Date.now() + VALIDADE_CACHE_MS })
    return vazio
  }

  // ── Remessas e quem pagou cada uma ────────────────────────────────────────
  const remessasBrutas = await remessasQueContam(admin, emp)

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
    const daJanela = remessasBrutas
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
            .eq("remessa_id", r.id)
            .order("id", { ascending: true })
            .range(de, ate)
      )
      for (const l of linhas) {
        // O vínculo pelo id do cadastro é o que o sistema mantém; o CPF
        // gravado na linha é informativo e pode estar desatualizado ou errado
        // (na demo, linhas com CPF diferente do cadastro faziam a pessoa
        // constar como inadimplente mesmo pagando todo mês).
        const cpf =
          (l.filiado_id ? (cpfPorId.get(l.filiado_id) ?? null) : null) ?? l.cpf ?? null
        if (cpf) cpfs.add(cpf)
      }
      pagantes.push(cpfs)
    }

    let inadimplentes = 0
    for (const cpf of cpfsAtivos) {
      // Faltas na ordem da mais recente para trás.
      const faltou = pagantes.map((s) => !s.has(cpf))
      const apurado = aplicarRegra(regra, daJanela, faltou)
      if (!apurado) continue

      inadimplentes++
      const lista = faltasPorCpf.get(cpf) ?? []
      lista.push({ tipo: regra.tipo, ...apurado })
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

  const suspensosPorCpf = suspensoesVigentes(suspensoes ?? [])

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
  ordenarLista(lista)

  const dados: RelatorioInadimplencia = {
    configurado: true,
    ativos: ativos.size,
    semCpf,
    porTipo,
    lista,
    suspensos: lista.filter((l) => l.suspenso).length,
    geradoEm: new Date().toISOString(),
  }
  cache.set(emp, { dados, expira: Date.now() + VALIDADE_CACHE_MS })
  return dados
}

// ── Uma pessoa só (portal) ───────────────────────────────────────────────────

export type InadimplenciaDoCpf = {
  /** Há regra ligada; sem ela ninguém está "em atraso" (e a tela diz isso). */
  configurado: boolean
  /** As regras ligadas — a tela diz quantas faltas cada uma tolera. */
  regras: RegraInadimplencia[]
  /** Um item por tipo de remessa em que a pessoa atinge a regra. Vazio = em dia. */
  itens: Inadimplente[]
}

/**
 * A apuração do relatório para UMA pessoa. "Minha contribuição" precisa de
 * um sim/não sobre um CPF; varrer a entidade inteira (todos os cadastros e
 * todas as linhas de cada remessa da janela, ~100 consultas no tenant real)
 * a cada abertura do portal era caro — e dependia de um cache.
 *
 * O veredito é o mesmo de `relatorioInadimplencia().lista` filtrada pelas
 * grafias do CPF (o relatório casa pelo TEXTO do CPF gravado, e o legado tem
 * as duas grafias): mesma régua de ativo, as mesmas remessas na janela
 * (`remessasQueContam`), o mesmo casamento linha → CPF, a mesma regra
 * (`aplicarRegra`) e as mesmas suspensões. Só lê os registros da pessoa.
 *
 * Erro de leitura LANÇA: quem chama não pode transformar "não deu para
 * apurar" em "em dia".
 */
export async function inadimplenciaDoCpf(
  cpfBruto: string,
  opcoes: { regras?: RegraInadimplencia[] } = {}
): Promise<InadimplenciaDoCpf> {
  const regras = (opcoes.regras ?? (await lerRegrasInadimplencia())).filter((r) => r.ativo)
  if (regras.length === 0) return { configurado: false, regras: [], itens: [] }

  const cpf = cpfConfiavel(cpfBruto)
  if (!cpf) throw new Error("CPF inválido para apurar a inadimplência.")
  const grafias = grafiasDoCpf(cpf)

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // TODOS os cadastros com o CPF, inclusive excluídos: o relatório credita a
  // linha ao CPF do cadastro do `filiado_id`, seja qual for a situação dele.
  const { data: cadastros, error: eCad } = await admin
    .from("filiacoes")
    .select("id, cpf, nome_completo, matricula_sindical, filiacao_condicao, filiacao_excluida, anonimizada_em")
    .eq("emp_proprietaria_id", emp)
    .in("cpf", grafias)
    .order("id", { ascending: true })
  if (eCad) throw new Error(`Falha ao ler o cadastro: ${eCad.message}`)

  const cpfDoCadastro = new Map<string, string>()
  // Grafia → nome e matrícula, como o relatório: o primeiro ativo (por id) com nome.
  const ativos = new Map<string, { nome: string | null; matricula: string | null }>()
  for (const c of cadastros ?? []) {
    const grafia = c.cpf as string
    cpfDoCadastro.set(String(c.id), grafia)
    // A régua de filiacao-ativos.ts: condição Ativo, fora dos excluídos e dos anonimizados.
    const ativo =
      c.filiacao_condicao === CONDICAO_ATIVO && c.filiacao_excluida !== true && c.anonimizada_em === null
    if (!ativo) continue
    const nome = (c.nome_completo as string | null) ?? null
    const atual = ativos.get(grafia)
    if (!atual) ativos.set(grafia, { nome: nome || null, matricula: nome ? ((c.matricula_sindical as string | null) ?? null) : null })
    else if (!atual.nome && nome) ativos.set(grafia, { nome, matricula: (c.matricula_sindical as string | null) ?? null })
  }
  // Quem não é ativo não entra no relatório.
  if (ativos.size === 0) return { configurado: true, regras, itens: [] }

  const remessas = await remessasQueContam(admin, emp)
  const janelas = regras.map((regra) => ({
    regra,
    daJanela: remessas.filter((r) => r.tipo === regra.tipo).slice(0, regra.janelaRemessas),
  }))
  const idsJanela = [...new Set(janelas.flatMap((j) => j.daJanela.map((r) => r.id)))]

  // As linhas que podem ser desta pessoa: as dos cadastros dela e as que
  // trazem o CPF dela (quando o `filiado_id` não aponta cadastro com CPF, o
  // relatório usa o da linha).
  // São poucas linhas (uma por remessa, se tanto): SEM `order` — com ele o
  // planejador percorria a tabela inteira pela chave (no tenant real a busca
  // pelo CPF, que não acha nada, levava 1 s e estourava o tempo sob carga).
  type Linha = { id: string; remessa_id: string; cpf: string | null; filiado_id: string | null }
  const TETO = 1000
  const poucas = async (consulta: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) => {
    const { data, error } = await consulta
    if (error) throw new Error(`Falha na apuração: ${error.message}`)
    // No teto do PostgREST não dá para garantir que veio tudo.
    if ((data?.length ?? 0) >= TETO) throw new Error("Falha na apuração: linhas demais para uma pessoa.")
    return (data ?? []) as Linha[]
  }
  const idsCadastros = [...cpfDoCadastro.keys()]
  const [porCadastro, porCpf] = idsJanela.length
    ? await Promise.all([
        poucas(
          admin
            .from("filiacao_recebe")
            .select("id, remessa_id, cpf, filiado_id")
            .in("remessa_id", idsJanela)
            .in("filiado_id", idsCadastros)
            .limit(TETO)
        ),
        poucas(
          admin
            .from("filiacao_recebe")
            .select("id, remessa_id, cpf, filiado_id")
            .in("remessa_id", idsJanela)
            .in("cpf", grafias)
            .limit(TETO)
        ),
      ])
    : [[], []]
  const linhas = new Map<string, Linha>()
  for (const l of [...porCadastro, ...porCpf]) linhas.set(String(l.id), l)

  // Linha com o CPF da pessoa mas `filiado_id` de outro cadastro: vale o CPF
  // daquele cadastro, se ele tiver um (mesmo mapa do relatório).
  const alheios = [
    ...new Set(
      [...linhas.values()]
        .map((l) => l.filiado_id)
        .filter((id): id is string => !!id && !cpfDoCadastro.has(id))
    ),
  ]
  const cpfAlheio = new Map<string, string>()
  if (alheios.length) {
    const { data, error } = await admin
      .from("filiacoes")
      .select("id, cpf")
      .eq("emp_proprietaria_id", emp)
      .not("cpf", "is", null)
      .in("id", alheios)
    if (error) throw new Error(`Falha ao ler cadastros: ${error.message}`)
    for (const f of data ?? []) cpfAlheio.set(String(f.id), f.cpf as string)
  }

  // Remessa → grafias que pagaram.
  const pagantes = new Map<string, Set<string>>()
  for (const l of linhas.values()) {
    const doCadastro = l.filiado_id
      ? (cpfDoCadastro.get(l.filiado_id) ?? cpfAlheio.get(l.filiado_id))
      : undefined
    const cpfLinha = doCadastro !== undefined ? doCadastro : (l.cpf ?? null)
    if (!cpfLinha) continue
    const s = pagantes.get(String(l.remessa_id)) ?? new Set<string>()
    s.add(cpfLinha)
    pagantes.set(String(l.remessa_id), s)
  }

  const { data: suspensoes, error: eSus } = await admin
    .from("filiacao_suspensoes")
    .select("cpf, alvo, vigencia_ate")
    .eq("emp_proprietaria_id", emp)
    .eq("escopo", "inadimplencia")
    .is("revogada_em", null)
    .in("cpf", grafias)
  if (eSus) throw new Error(`Falha ao ler suspensões: ${eSus.message}`)
  const suspensosPorCpf = suspensoesVigentes(suspensoes ?? [])

  const itens: Inadimplente[] = []
  for (const [grafia, quem] of ativos) {
    const alvos = suspensosPorCpf.get(grafia)
    for (const { regra, daJanela } of janelas) {
      // Sem remessa na janela, o relatório não aponta ninguém neste tipo.
      if (daJanela.length === 0) continue
      const faltou = daJanela.map((r) => !pagantes.get(r.id)?.has(grafia))
      const apurado = aplicarRegra(regra, daJanela, faltou)
      if (!apurado) continue
      itens.push({
        cpf: grafia,
        nome: quem.nome,
        matricula: quem.matricula,
        tipo: regra.tipo,
        faltas: apurado.faltas,
        remessasEmFalta: apurado.remessas,
        ultimoPagamento: apurado.ultimoPagamento,
        suspenso: Boolean(alvos && (alvos.has(null) || alvos.has(regra.tipo))),
      })
    }
  }
  ordenarLista(itens)
  return { configurado: true, regras, itens }
}
