import "server-only"

import { hojeSP } from "@/lib/db/comum"
import { lerCarencias, listarSuspensoes } from "@/lib/db/filiacao-direitos"
import { ehArquivo } from "@/lib/db/filiacao-documentos"
import { relatorioInadimplencia } from "@/lib/db/filiacao-inadimplencia"
import { lerLotes } from "@/lib/db/fontes"
import { FILIACAO_CONDICOES, GRUPOS_CONDICAO } from "@/lib/filiacao"
import { conferirCarencia, type Direito } from "@/lib/filiacao-direitos-constantes"
import {
  COLUNAS_PADRAO,
  COLUNAS_RELATORIO,
  MODELOS_RELATORIO,
  type ColunaRelatorio,
  type ModeloRelatorio,
  type OrdemRelatorio,
} from "@/lib/filiacao-relatorios-constantes"
import { formatarCpf } from "@/lib/cpf"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Relatórios de filiados (restritos à gestão da filiação).
 *
 * Um único conjunto de dados por tenant — cadastro + vínculo corrente +
 * carência de VOTO + inadimplência + termos — apurado em memória e guardado
 * por 10 minutos; os modelos fixos (em carência, plenos, inadimplentes) são
 * recortes desse conjunto, e o personalizado deixa o gestor combinar filtros
 * e escolher colunas.
 *
 * A carência segue a mesma regra do portal (`conferirCarencia`): conta da
 * filiação MAIS RECENTE do CPF; com efeito suspensivo, da primeira; quem não
 * tem vínculo datado usa a competência mais antiga em que aparece numa
 * remessa. A inadimplência vem do relatório já existente.
 */

const VALIDADE_CACHE_MS = 10 * 60 * 1000

export type LinhaRelatorio = {
  id: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  condicao: string | null
  excluida: boolean
  sexo: string | null
  nascimento: string | null
  idade: number | null
  cidade: string | null
  uf: string | null
  email: string | null
  telefone: string | null
  cadastro: string | null
  // vínculo corrente (em aberto mais recente; senão o mais recente)
  vinculoAberto: boolean
  fonteId: string | null
  fonte: string | null
  condicaoFonte: string | null
  regime: string | null
  lotacao: string | null
  cargo: string | null
  matriculaFonte: string | null
  temFicha: boolean
  filiacao: string | null
  primeiraFiliacao: string | null
  // direitos
  carencia: "cumprida" | "em_carencia" | "sem_data"
  liberaEm: string | null
  diasRestantes: number | null
  suspensoCarencia: boolean
  inadimplente: boolean
  tiposInadimplencia: string[]
  faltas: number
  remessasEmFalta: string[]
  ultimoPagamento: string | null
  suspensoInadimplencia: boolean
  lgpd: boolean
  desconto: boolean
}

export type BaseRelatorios = {
  linhas: LinhaRelatorio[]
  fontes: { id: string; nome: string }[]
  ufs: string[]
  carenciaVotoDias: number
  carenciaAtiva: boolean
  inadimplenciaConfigurada: boolean
  geradoEm: string
}

let cache: { dados: BaseRelatorios; expira: number } | null = null

export function invalidarCacheRelatorios() {
  cache = null
}

type Cadastro = Record<string, unknown>
type Vinculo = Record<string, unknown>

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const dataVinculo = (v: Vinculo) => texto(v.data_filiacao) ?? texto(v.filiacao_data_adesao)
const aberto = (v: Vinculo) => !v.data_desfiliacao && !v.filiacao_data_saida

function normalizarUf(valor: string | null): string | null {
  if (!valor) return null
  const v = valor.trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(v)) return v
  const mapa: Record<string, string> = {
    "RIO DE JANEIRO": "RJ",
    "SÃO PAULO": "SP",
    BAHIA: "BA",
    SERGIPE: "SE",
    "ESPÍRITO SANTO": "ES",
    "MINAS GERAIS": "MG",
  }
  const chave = v.replace(/\s*\(.*\)\s*$/, "").replace(/^([A-Z]{2})\s*-.*$/, "$1")
  if (/^[A-Z]{2}$/.test(chave)) return chave
  return mapa[chave] ?? null
}

function idadeEm(nascimento: string | null, hoje: string): number | null {
  if (!nascimento) return null
  const [a, m, d] = nascimento.slice(0, 10).split("-").map(Number)
  const [ha, hm, hd] = hoje.split("-").map(Number)
  if (!a || !ha) return null
  let idade = ha - a
  if (hm < m || (hm === m && hd < d)) idade--
  return idade >= 0 && idade < 130 ? idade : null
}

/** `202110` → `"2021-10-01"`. */
function primeiroDiaDaCompetencia(ordem: number): string | null {
  const t = String(ordem)
  return /^\d{6}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-01` : null
}

export async function baseRelatorios(): Promise<BaseRelatorios> {
  if (cache && cache.expira > Date.now()) return cache.dados

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()

  const [cadastros, vinculos, carencias, suspensoes, inadimplencia, termos] =
    await Promise.all([
      lerLotes<Cadastro>((de, ate) =>
        admin
          .from("filiacoes")
          .select(
            "id, nome_completo, cpf, matricula_sindical, filiacao_condicao, filiacao_excluida, sexo, nascimento_data, endereco_cidade, endereco_estado, email_pessoal, telefone_1, created_at, tl_lgpd_id, tl_desconto_id"
          )
          .eq("emp_proprietaria_id", emp)
          .order("id", { ascending: true })
          .range(de, ate)
      ),
      lerLotes<Vinculo>((de, ate) =>
        admin
          .from("filiacao_vinculos")
          .select(
            "id, filiado_id, fonte_pagadora_id, matricula, cargo, lotacao, data_filiacao, filiacao_data_adesao, data_desfiliacao, filiacao_data_saida, ficha_filiacao, condicao_na_fonte, regime_trabalho"
          )
          .eq("emp_proprietaria_id", emp)
          .not("filiado_id", "is", null)
          .order("id", { ascending: true })
          .range(de, ate)
      ),
      lerCarencias(),
      listarSuspensoes({ escopo: "carencia" }),
      relatorioInadimplencia(),
      Promise.all(
        ["filiacao_tl_lgpd", "filiacao_tl_desconto"].map(async (tabela) => {
          const { data } = await admin
            .from(tabela)
            .select("id")
            .eq("emp_proprietaria_id", emp)
            .eq("em_vigor", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          return data ? String(data.id) : null
        })
      ),
    ])
  const [lgpdVigente, descontoVigente] = termos
  const carenciaVoto = carencias.find((c) => c.beneficio === "votacao") ?? {
    beneficio: "votacao" as const,
    dias: 0,
    ativo: false,
    observacao: null,
  }

  // ── Vínculo corrente e datas por filiado / por CPF ────────────────────
  const correntePorFiliado = new Map<string, Vinculo>()
  const datasPorFiliado = new Map<string, string[]>()
  for (const v of vinculos) {
    const fid = String(v.filiado_id)
    const d = dataVinculo(v)
    if (d) datasPorFiliado.set(fid, [...(datasPorFiliado.get(fid) ?? []), d])
    const atual = correntePorFiliado.get(fid)
    if (!atual) {
      correntePorFiliado.set(fid, v)
      continue
    }
    // Aberto ganha de fechado; entre iguais, o mais recente.
    const melhor =
      aberto(v) !== aberto(atual)
        ? aberto(v)
        : (dataVinculo(v) ?? "") > (dataVinculo(atual) ?? "")
    if (melhor) correntePorFiliado.set(fid, v)
  }
  // Datas por CPF (a pessoa pode ter mais de um registro de filiação).
  const idsPorCpf = new Map<string, string[]>()
  for (const c of cadastros) {
    const cpf = texto(c.cpf)
    if (cpf) idsPorCpf.set(cpf, [...(idsPorCpf.get(cpf) ?? []), String(c.id)])
  }
  const datasDoCadastro = (c: Cadastro): string[] => {
    const cpf = texto(c.cpf)
    const ids = cpf ? (idsPorCpf.get(cpf) ?? [String(c.id)]) : [String(c.id)]
    return ids.flatMap((id) => datasPorFiliado.get(id) ?? []).sort()
  }

  // Piso pelo pagamento para os ATIVOS sem vínculo datado (poucos).
  const semData = cadastros.filter(
    (c) => c.filiacao_condicao === "Ativo" && datasDoCadastro(c).length === 0
  )
  const pisoPorFiliado = new Map<string, string>()
  for (let de = 0; de < semData.length; de += 100) {
    const ids = semData.slice(de, de + 100).map((c) => String(c.id))
    const { data: recebe } = await admin
      .from("filiacao_recebe")
      .select("filiado_id, remessa_id")
      .eq("emp_proprietaria_id", emp)
      .in("filiado_id", ids)
      .not("remessa_id", "is", null)
      .limit(5000)
    const remessaIds = [...new Set((recebe ?? []).map((r) => String(r.remessa_id)))]
    const ordemPorRemessa = new Map<string, number>()
    for (let i = 0; i < remessaIds.length; i += 200) {
      const { data } = await admin
        .from("filiacao_recebe_remessa")
        .select("id, ordem")
        .in("id", remessaIds.slice(i, i + 200))
        .not("ordem", "is", null)
      for (const r of data ?? []) ordemPorRemessa.set(String(r.id), Number(r.ordem))
    }
    for (const r of recebe ?? []) {
      const ordem = ordemPorRemessa.get(String(r.remessa_id))
      if (!ordem) continue
      const piso = primeiroDiaDaCompetencia(ordem)
      if (!piso) continue
      const fid = String(r.filiado_id)
      const atual = pisoPorFiliado.get(fid)
      if (!atual || piso < atual) pisoPorFiliado.set(fid, piso)
    }
  }

  const suspensosCarencia = new Set(
    suspensoes.filter((s) => !s.alvo || s.alvo === "votacao").map((s) => s.cpf)
  )
  const inadimplentePorCpf = new Map<
    string,
    { tipos: string[]; faltas: number; remessas: string[]; ultimo: string | null; suspenso: boolean }
  >()
  for (const i of inadimplencia.lista) {
    const atual = inadimplentePorCpf.get(i.cpf) ?? {
      tipos: [],
      faltas: 0,
      remessas: [],
      ultimo: null,
      suspenso: false,
    }
    atual.tipos.push(i.tipo)
    atual.faltas += i.faltas
    atual.remessas.push(...i.remessasEmFalta)
    if (i.ultimoPagamento && (!atual.ultimo || i.ultimoPagamento > atual.ultimo)) {
      atual.ultimo = i.ultimoPagamento
    }
    atual.suspenso = atual.suspenso || i.suspenso
    inadimplentePorCpf.set(i.cpf, atual)
  }

  // Nomes das fontes
  const fonteIds = [
    ...new Set(
      [...correntePorFiliado.values()]
        .map((v) => texto(v.fonte_pagadora_id))
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const nomeFonte = new Map<string, string>()
  for (let de = 0; de < fonteIds.length; de += 200) {
    const { data } = await admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao")
      .in("id", fonteIds.slice(de, de + 200))
    for (const e of data ?? []) {
      nomeFonte.set(String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "(sem nome)")
    }
  }

  const agora = new Date()
  const linhas: LinhaRelatorio[] = cadastros.map((c) => {
    const id = String(c.id)
    const cpf = texto(c.cpf)
    const v = correntePorFiliado.get(id) ?? null
    const datas = datasDoCadastro(c)
    const piso = pisoPorFiliado.get(id) ?? null
    const primeira = datas[0] ?? piso
    const maisRecente = datas[datas.length - 1] ?? piso
    const suspenso = cpf ? suspensosCarencia.has(cpf) : false
    let direito: Direito = { liberado: true }
    let carencia: LinhaRelatorio["carencia"] = "cumprida"
    if (!maisRecente) {
      carencia = "sem_data"
      direito = { liberado: false }
    } else {
      direito = conferirCarencia(carenciaVoto, { maisRecente, primeira }, suspenso, agora)
      carencia = direito.liberado ? "cumprida" : "em_carencia"
    }
    const inad = cpf ? inadimplentePorCpf.get(cpf) : undefined
    const nascimento = texto(c.nascimento_data)?.slice(0, 10) ?? null
    return {
      id,
      nome: texto(c.nome_completo),
      cpf,
      matricula: texto(c.matricula_sindical),
      condicao: texto(c.filiacao_condicao),
      excluida: c.filiacao_excluida === true,
      sexo: texto(c.sexo),
      nascimento,
      idade: idadeEm(nascimento, hoje),
      cidade: texto(c.endereco_cidade),
      uf: normalizarUf(texto(c.endereco_estado)),
      email: texto(c.email_pessoal),
      telefone: texto(c.telefone_1),
      cadastro: texto(c.created_at),
      vinculoAberto: v ? aberto(v) : false,
      fonteId: v ? texto(v.fonte_pagadora_id) : null,
      fonte: v && v.fonte_pagadora_id ? (nomeFonte.get(String(v.fonte_pagadora_id)) ?? null) : null,
      condicaoFonte: v ? texto(v.condicao_na_fonte) : null,
      regime: v ? texto(v.regime_trabalho) : null,
      lotacao: v ? texto(v.lotacao) : null,
      cargo: v ? texto(v.cargo) : null,
      matriculaFonte: v ? texto(v.matricula) : null,
      temFicha: v ? ehArquivo(texto(v.ficha_filiacao)) : false,
      filiacao: maisRecente,
      primeiraFiliacao: primeira,
      carencia,
      liberaEm: direito.liberaEm ? direito.liberaEm.slice(0, 10) : null,
      diasRestantes: direito.diasRestantes ?? null,
      suspensoCarencia: suspenso,
      inadimplente: Boolean(inad),
      tiposInadimplencia: inad?.tipos ?? [],
      faltas: inad?.faltas ?? 0,
      remessasEmFalta: inad?.remessas ?? [],
      ultimoPagamento: inad?.ultimo ?? null,
      suspensoInadimplencia: inad?.suspenso ?? false,
      lgpd: Boolean(lgpdVigente) && c.tl_lgpd_id === lgpdVigente,
      desconto: Boolean(descontoVigente) && c.tl_desconto_id === descontoVigente,
    }
  })

  const fontes = [...nomeFonte.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  const ufs = [...new Set(linhas.map((l) => l.uf).filter((u): u is string => Boolean(u)))].sort()

  const dados: BaseRelatorios = {
    linhas,
    fontes,
    ufs,
    carenciaVotoDias: carenciaVoto.dias,
    carenciaAtiva: carenciaVoto.ativo && carenciaVoto.dias > 0,
    inadimplenciaConfigurada: inadimplencia.configurado,
    geradoEm: new Date().toISOString(),
  }
  cache = { dados, expira: Date.now() + VALIDADE_CACHE_MS }
  return dados
}

// ── Filtros ─────────────────────────────────────────────────────────────────

export type FiltrosRelatorio = {
  busca?: string
  situacao?: string
  condicao?: string
  sexo?: string
  uf?: string
  cidade?: string
  lotacao?: string
  fonte?: string
  condicaoFonte?: string
  regime?: string
  carencia?: string
  inadimplente?: string
  ficha?: string
  lgpd?: string
  desconto?: string
  vinculo?: string
  filiacaoDe?: string
  filiacaoAte?: string
  idadeMin?: string
  idadeMax?: string
  ordem?: string
  dir?: string
  colunas?: string
}

/** Filtros travados por modelo — o gestor não muda o que define o relatório. */
export const FILTROS_FIXOS: Record<ModeloRelatorio, Partial<FiltrosRelatorio>> = {
  carencia: { situacao: "ativas", condicao: "Ativo", carencia: "em_carencia" },
  plenos: { situacao: "ativas", condicao: "Ativo", carencia: "cumprida" },
  inadimplentes: { situacao: "ativas", condicao: "Ativo", inadimplente: "sim" },
  personalizado: {},
}

export function ehModelo(v: string | undefined): v is ModeloRelatorio {
  return (MODELOS_RELATORIO as readonly string[]).includes(v ?? "")
}

export function colunasDoPedido(
  modelo: ModeloRelatorio,
  colunas: string | undefined
): ColunaRelatorio[] {
  const validas = new Set(COLUNAS_RELATORIO.map((c) => c.chave) as string[])
  const pedidas = (colunas ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => validas.has(c)) as ColunaRelatorio[]
  if (pedidas.length === 0) return COLUNAS_PADRAO[modelo]
  // Mantém a ordem canônica das colunas, não a da URL.
  return COLUNAS_RELATORIO.map((c) => c.chave).filter((c) => pedidas.includes(c))
}

const dataISO = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const inteiro = (v?: string) => (v && /^\d{1,3}$/.test(v) ? Number(v) : null)

export function filtrarRelatorio(
  base: BaseRelatorios,
  filtros: FiltrosRelatorio
): LinhaRelatorio[] {
  const busca = semAcento((filtros.busca ?? "").trim())
  const digitos = (filtros.busca ?? "").replace(/\D/g, "")
  const situacao = filtros.situacao ?? "ativas"
  const condicao = filtros.condicao ?? "todas"
  const grupo = condicao in GRUPOS_CONDICAO ? new Set<string>(GRUPOS_CONDICAO[condicao].condicoes) : null
  const cidade = semAcento((filtros.cidade ?? "").trim())
  const lotacao = semAcento((filtros.lotacao ?? "").trim())
  const de = dataISO(filtros.filiacaoDe)
  const ate = dataISO(filtros.filiacaoAte)
  const idadeMin = inteiro(filtros.idadeMin)
  const idadeMax = inteiro(filtros.idadeMax)

  const linhas = base.linhas.filter((l) => {
    if (situacao === "ativas" && l.excluida) return false
    if (situacao === "excluidas" && !l.excluida) return false
    if (condicao === "nenhuma") {
      if (l.condicao) return false
    } else if (grupo) {
      if (!l.condicao || !grupo.has(l.condicao)) return false
    } else if (condicao !== "todas" && (FILIACAO_CONDICOES as readonly string[]).includes(condicao)) {
      if (l.condicao !== condicao) return false
    }
    if (filtros.sexo && filtros.sexo !== "todos") {
      if (filtros.sexo === "nenhum" ? l.sexo !== null : l.sexo !== filtros.sexo) return false
    }
    if (filtros.uf && filtros.uf !== "todas" && l.uf !== filtros.uf) return false
    if (cidade && !semAcento(l.cidade ?? "").includes(cidade)) return false
    if (lotacao && !semAcento(l.lotacao ?? "").includes(lotacao)) return false
    if (filtros.fonte && filtros.fonte !== "todas" && l.fonteId !== filtros.fonte) return false
    if (filtros.condicaoFonte && filtros.condicaoFonte !== "todas" && l.condicaoFonte !== filtros.condicaoFonte) return false
    if (filtros.regime && filtros.regime !== "todos" && l.regime !== filtros.regime) return false
    if (filtros.carencia && filtros.carencia !== "todas" && l.carencia !== filtros.carencia) return false
    if (filtros.inadimplente === "sim" && !l.inadimplente) return false
    if (filtros.inadimplente === "nao" && l.inadimplente) return false
    if (filtros.ficha === "com" && !l.temFicha) return false
    if (filtros.ficha === "sem" && l.temFicha) return false
    if (filtros.lgpd === "aceito" && !l.lgpd) return false
    if (filtros.lgpd === "nao" && l.lgpd) return false
    if (filtros.desconto === "aceito" && !l.desconto) return false
    if (filtros.desconto === "nao" && l.desconto) return false
    if (filtros.vinculo === "aberto" && !l.vinculoAberto) return false
    if (filtros.vinculo === "sem_aberto" && l.vinculoAberto) return false
    if (de && (!l.filiacao || l.filiacao < de)) return false
    if (ate && (!l.filiacao || l.filiacao > ate)) return false
    if (idadeMin !== null && (l.idade === null || l.idade < idadeMin)) return false
    if (idadeMax !== null && (l.idade === null || l.idade > idadeMax)) return false
    if (busca) {
      if (digitos.length >= 3 && (l.cpf ?? "").includes(digitos)) return true
      if (!semAcento(l.nome ?? "").includes(busca)) return false
    }
    return true
  })

  const ordem = (filtros.ordem ?? "nome") as OrdemRelatorio
  const dir = filtros.dir === "desc" ? -1 : 1
  const chave = (l: LinhaRelatorio): string | number => {
    switch (ordem) {
      case "filiacao":
        return l.filiacao ?? ""
      case "idade":
        return l.idade ?? -1
      case "matricula":
        return Number(l.matricula ?? 0) || 0
      case "diasRestantes":
        return l.diasRestantes ?? -1
      case "faltas":
        return l.faltas
      default:
        return (l.nome ?? "").toLocaleLowerCase("pt-BR")
    }
  }
  return linhas.sort((a, b) => {
    const ka = chave(a)
    const kb = chave(b)
    if (typeof ka === "number" && typeof kb === "number") return (ka - kb) * dir
    return String(ka).localeCompare(String(kb), "pt-BR") * dir
  })
}

/** Valor de uma coluna, já formatado para tela e CSV. */
export function valorDaColuna(l: LinhaRelatorio, coluna: ColunaRelatorio): string {
  const simNao = (v: boolean) => (v ? "Sim" : "Não")
  switch (coluna) {
    case "nome":
      return l.nome ?? ""
    case "cpf":
      return l.cpf ? formatarCpf(l.cpf) : ""
    case "matricula":
      return l.matricula ?? ""
    case "condicao":
      return l.condicao ?? ""
    case "sexo":
      return l.sexo ?? ""
    case "idade":
      return l.idade !== null ? String(l.idade) : ""
    case "nascimento":
      return l.nascimento ? formatarData(l.nascimento) : ""
    case "fonte":
      return l.fonte ?? ""
    case "condicaoFonte":
      return l.condicaoFonte ?? ""
    case "regime":
      return l.regime ?? ""
    case "lotacao":
      return l.lotacao ?? ""
    case "cargo":
      return l.cargo ?? ""
    case "matriculaFonte":
      return l.matriculaFonte ?? ""
    case "filiacao":
      return l.filiacao ? formatarData(l.filiacao) : ""
    case "primeiraFiliacao":
      return l.primeiraFiliacao ? formatarData(l.primeiraFiliacao) : ""
    case "carencia":
      return l.carencia === "cumprida"
        ? "Cumprida"
        : l.carencia === "em_carencia"
          ? "Em carência"
          : "Sem data"
    case "liberaEm":
      return l.liberaEm ? formatarData(l.liberaEm) : ""
    case "diasRestantes":
      return l.diasRestantes !== null ? String(l.diasRestantes) : ""
    case "inadimplencia":
      return l.inadimplente ? l.tiposInadimplencia.join(", ") || "Sim" : "Em dia"
    case "faltas":
      return l.inadimplente ? String(l.faltas) : ""
    case "remessasEmFalta":
      return l.remessasEmFalta.join(", ")
    case "ultimoPagamento":
      return l.ultimoPagamento ?? ""
    case "suspenso":
      return l.suspensoCarencia || l.suspensoInadimplencia ? "Sim" : ""
    case "ficha":
      return simNao(l.temFicha)
    case "lgpd":
      return simNao(l.lgpd)
    case "desconto":
      return simNao(l.desconto)
    case "cidade":
      return l.cidade ?? ""
    case "uf":
      return l.uf ?? ""
    case "email":
      return l.email ?? ""
    case "telefone":
      return l.telefone ?? ""
    case "cadastro":
      return l.cadastro ? formatarData(l.cadastro) : ""
  }
}

/** Totais dos modelos fixos, para o hub. */
export async function totaisRelatorios(): Promise<{
  ativos: number
  emCarencia: number
  plenos: number
  inadimplentes: number
  semData: number
}> {
  const base = await baseRelatorios()
  const ativos = base.linhas.filter((l) => l.condicao === "Ativo" && !l.excluida)
  return {
    ativos: ativos.length,
    emCarencia: ativos.filter((l) => l.carencia === "em_carencia").length,
    plenos: ativos.filter((l) => l.carencia === "cumprida").length,
    inadimplentes: ativos.filter((l) => l.inadimplente).length,
    semData: ativos.filter((l) => l.carencia === "sem_data").length,
  }
}
