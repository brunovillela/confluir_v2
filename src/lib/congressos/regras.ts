/**
 * Congressos — regras puras: direitos dos papéis, modelos, cálculo de vagas,
 * ordem de inscrição com lista de espera, cotas e conferência de consistência.
 *
 * Cada função recebe a configuração e os números e devolve o resultado com a
 * explicação. A mesma função serve a tela, o simulador e o evento.
 * Testes: tests/unidade/congressos.spec.ts
 */

import { normalizarConfig, valor, valoresPadrao, type ConfigCongresso, type ValorAjuste } from "./config"

// ── Papéis e direitos ────────────────────────────────────────────────────────

export type CategoriaPapel =
  | "delegado"
  | "suplente"
  | "nato"
  | "observador"
  | "convidado"
  | "expositor"
  | "assessor"
  | "imprensa"
  | "equipe"
  | "comissao"
  | "outro"

export const CATEGORIAS_PAPEL: { valor: CategoriaPapel; rotulo: string }[] = [
  { valor: "delegado", rotulo: "Delegado" },
  { valor: "nato", rotulo: "Delegado nato" },
  { valor: "suplente", rotulo: "Suplente" },
  { valor: "observador", rotulo: "Observador" },
  { valor: "convidado", rotulo: "Convidado" },
  { valor: "expositor", rotulo: "Expositor" },
  { valor: "assessor", rotulo: "Assessor" },
  { valor: "imprensa", rotulo: "Imprensa" },
  { valor: "equipe", rotulo: "Equipe" },
  { valor: "comissao", rotulo: "Comissão organizadora" },
  { valor: "outro", rotulo: "Outro" },
]

export type NivelVoz = "livre" | "autorizacao" | "nao"

export type Direitos = {
  voz_plenaria: NivelVoz
  voz_grupo: NivelVoz
  voto_plenaria: boolean
  voto_grupo: boolean
  /** Suplente: vota só quando assume o lugar de um titular. */
  voto_so_substituindo: boolean
  propor: boolean
  destaque: boolean
  questao_ordem: boolean
  declaracao_voto: boolean
  assinar_mocao: boolean
  candidatar: boolean
  votar_eleicao: boolean
  acesso_plenaria: boolean
  conta_quorum: boolean
  /** Entra na conta de "X% dos delegados". */
  conta_denominador: boolean
  /** Ocupa vaga da base no limite de delegados. */
  ocupa_vaga: boolean
}

export const DIREITOS_ROTULO: { chave: keyof Direitos; rotulo: string; tipo: "voz" | "sim_nao" }[] = [
  { chave: "voz_plenaria", rotulo: "Voz na plenária", tipo: "voz" },
  { chave: "voz_grupo", rotulo: "Voz no grupo", tipo: "voz" },
  { chave: "voto_plenaria", rotulo: "Voto na plenária", tipo: "sim_nao" },
  { chave: "voto_grupo", rotulo: "Voto no grupo", tipo: "sim_nao" },
  { chave: "voto_so_substituindo", rotulo: "Vota só substituindo titular", tipo: "sim_nao" },
  { chave: "propor", rotulo: "Apresenta propostas", tipo: "sim_nao" },
  { chave: "destaque", rotulo: "Pede destaque", tipo: "sim_nao" },
  { chave: "questao_ordem", rotulo: "Questão de ordem", tipo: "sim_nao" },
  { chave: "declaracao_voto", rotulo: "Declaração de voto", tipo: "sim_nao" },
  { chave: "assinar_mocao", rotulo: "Assina moção", tipo: "sim_nao" },
  { chave: "candidatar", rotulo: "Candidata-se", tipo: "sim_nao" },
  { chave: "votar_eleicao", rotulo: "Vota em eleição", tipo: "sim_nao" },
  { chave: "acesso_plenaria", rotulo: "Acesso à plenária", tipo: "sim_nao" },
  { chave: "conta_quorum", rotulo: "Conta no quórum", tipo: "sim_nao" },
  { chave: "conta_denominador", rotulo: "Conta nos percentuais", tipo: "sim_nao" },
  { chave: "ocupa_vaga", rotulo: "Ocupa vaga da base", tipo: "sim_nao" },
]

const NENHUM: Direitos = {
  voz_plenaria: "nao",
  voz_grupo: "nao",
  voto_plenaria: false,
  voto_grupo: false,
  voto_so_substituindo: false,
  propor: false,
  destaque: false,
  questao_ordem: false,
  declaracao_voto: false,
  assinar_mocao: false,
  candidatar: false,
  votar_eleicao: false,
  acesso_plenaria: true,
  conta_quorum: false,
  conta_denominador: false,
  ocupa_vaga: false,
}

const DELEGADO: Direitos = {
  voz_plenaria: "livre",
  voz_grupo: "livre",
  voto_plenaria: true,
  voto_grupo: true,
  voto_so_substituindo: false,
  propor: true,
  destaque: true,
  questao_ordem: true,
  declaracao_voto: true,
  assinar_mocao: true,
  candidatar: true,
  votar_eleicao: true,
  acesso_plenaria: true,
  conta_quorum: true,
  conta_denominador: true,
  ocupa_vaga: true,
}

export const DIREITOS_PADRAO: Record<CategoriaPapel, Direitos> = {
  delegado: DELEGADO,
  nato: { ...DELEGADO, ocupa_vaga: false },
  suplente: { ...DELEGADO, voto_so_substituindo: true, conta_quorum: false, conta_denominador: false, ocupa_vaga: false },
  observador: { ...NENHUM, voz_plenaria: "autorizacao", voz_grupo: "livre", questao_ordem: true },
  convidado: { ...NENHUM, voz_plenaria: "autorizacao", voz_grupo: "autorizacao" },
  expositor: { ...NENHUM, voz_plenaria: "livre", voz_grupo: "livre" },
  assessor: { ...NENHUM, voz_plenaria: "autorizacao", voz_grupo: "autorizacao" },
  imprensa: { ...NENHUM },
  equipe: { ...NENHUM },
  comissao: { ...NENHUM, voz_plenaria: "livre", voz_grupo: "livre" },
  outro: { ...NENHUM },
}

/** Direitos gravados (jsonb) completados pelo padrão da categoria. */
export function normalizarDireitos(categoria: CategoriaPapel, bruto: unknown): Direitos {
  const base = DIREITOS_PADRAO[categoria] ?? NENHUM
  const obj = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>
  const r = { ...base } as Record<keyof Direitos, unknown>
  for (const d of DIREITOS_ROTULO) {
    const v = obj[d.chave]
    if (d.tipo === "voz") {
      if (v === "livre" || v === "autorizacao" || v === "nao") r[d.chave] = v
    } else if (typeof v === "boolean") r[d.chave] = v
  }
  return r as Direitos
}

/** Os direitos em linguagem clara, para a tela da pessoa e o caderno. */
export function resumoDireitos(d: Direitos): string {
  const partes: string[] = []
  if (d.voto_plenaria && !d.voto_so_substituindo) {
    partes.push(d.voto_grupo ? "Tem voz e voto nos grupos e na plenária" : "Tem voz e voto na plenária")
  } else {
    partes.push(
      d.voz_plenaria === "livre"
        ? "Tem voz na plenária"
        : d.voz_plenaria === "autorizacao"
          ? "Fala na plenária com autorização da mesa"
          : "Não fala na plenária"
    )
    partes.push(d.voto_plenaria ? "Vota só quando substitui um titular" : "Não vota")
  }
  const extras: string[] = []
  if (d.assinar_mocao) extras.push("assina moções")
  if (d.candidatar) extras.push("pode se candidatar")
  if (d.propor) extras.push("apresenta propostas")
  if (extras.length) partes.push(extras.join(", ").replace(/^./, (c) => c.toUpperCase()))
  if (!d.acesso_plenaria) partes.push("Sem acesso à plenária")
  return partes.join(". ") + "."
}

// ── Modelos ──────────────────────────────────────────────────────────────────

export type PapelModelo = { nome: string; categoria: CategoriaPapel; cor: string; direitos?: Partial<Direitos> }

export type Modelo = {
  id: string
  nome: string
  descricao: string
  valores: Record<string, ValorAjuste>
  papeis: PapelModelo[]
  unidadeTipo: "base" | "entidade" | "segmento" | "ramo" | "delegacao"
}

const PAPEIS_SINDICAIS: PapelModelo[] = [
  { nome: "Delegado", categoria: "delegado", cor: "#16a34a" },
  { nome: "Delegado nato", categoria: "nato", cor: "#15803d" },
  { nome: "Suplente", categoria: "suplente", cor: "#ca8a04" },
  { nome: "Observador", categoria: "observador", cor: "#2563eb" },
  { nome: "Convidado", categoria: "convidado", cor: "#7c3aed" },
  { nome: "Imprensa", categoria: "imprensa", cor: "#64748b" },
  { nome: "Equipe", categoria: "equipe", cor: "#0f172a" },
]

export const MODELOS: Modelo[] = [
  {
    id: "sindical_regional",
    nome: "Congresso sindical regional",
    descricao: "Sindicato com bases ou locais de trabalho: delegados por ordem de inscrição com limite por base, diretoria como nata, plenária em crachá.",
    unidadeTipo: "base",
    papeis: PAPEIS_SINDICAIS,
    valores: {
      "identidade.natureza": "congresso",
      "identidade.abrangencia": "regional",
      "delegacao.forma": "ordem_inscricao",
      "delegacao.calculo_vagas": "fixo",
      "delegacao.natos": "diretoria",
      "elegibilidade.filiacao": "em_dia",
      "programa.tem_grupos": true,
      "programa.entrada_grupo": "presenca",
      "mocoes.minimo_numero": 20,
      "mocoes.minimo_percentual": 90,
      "mocoes.percentual_de": "base_origem",
    },
  },
  {
    id: "federacao",
    nome: "Congresso ou plenária de federação",
    descricao: "Delegações dos sindicatos calculadas pelo número de sindicalizados, suplentes em lista ordenada, grupos com indicação.",
    unidadeTipo: "entidade",
    papeis: PAPEIS_SINDICAIS.concat([{ nome: "Assessor", categoria: "assessor", cor: "#0891b2" }]),
    valores: {
      "identidade.natureza": "congresso",
      "identidade.abrangencia": "nacional",
      "delegacao.forma": "indicacao",
      "delegacao.calculo_vagas": "coeficiente",
      "delegacao.coef_minimo": 8,
      "delegacao.coef_a_cada": 720,
      "delegacao.documento_indicacao": "ata",
      "delegacao.natos": "lista",
      "credenciamento.suplente_assume": "ordem",
      "programa.entrada_grupo": "indicacao",
      "elegibilidade.despesas": "rateio",
      "mocoes.minimo_percentual": 10,
    },
  },
  {
    id: "central_nacional",
    nome: "Congresso nacional de central",
    descricao: "Delegados eleitos em assembleias de base por coeficiente, observadores proporcionais, cota de gênero, eleição de direção.",
    unidadeTipo: "entidade",
    papeis: PAPEIS_SINDICAIS,
    valores: {
      "identidade.natureza": "congresso",
      "identidade.abrangencia": "nacional",
      "delegacao.forma": "eleicao_base",
      "delegacao.calculo_vagas": "coeficiente",
      "delegacao.coef_minimo": 0,
      "delegacao.coef_a_cada": 1500,
      "delegacao.coef_fracao": "metade_mais_um",
      "delegacao.documento_indicacao": "ata",
      "delegacao.natos": "lista",
      "delegacao.observadores": "percentual",
      "delegacao.observadores_percentual": 10,
      "cotas.genero_minimo": 30,
      "elegibilidade.taxa": "rateio",
      "credenciamento.segunda_via": "proibida",
      "credenciamento.apos_prazo": "bloqueia",
      "programa.tem_grupos": false,
      "plenaria.em_bloco": true,
      "plenaria.sem_oposicao": true,
      "mocoes.minimo_percentual": 10,
      "inscricao.pede_criancas": true,
      "inscricao.pede_genero": true,
    },
  },
  {
    id: "conferencia_publica",
    nome: "Conferência de políticas públicas",
    descricao: "Delegados indicados por entidades e segmentos, conselheiros como natos, GT com vagas e limite de propostas, moções votadas no grupo.",
    unidadeTipo: "segmento",
    papeis: [
      { nome: "Delegado", categoria: "delegado", cor: "#16a34a" },
      { nome: "Membro nato", categoria: "nato", cor: "#15803d" },
      { nome: "Suplente", categoria: "suplente", cor: "#ca8a04" },
      { nome: "Expositor", categoria: "expositor", cor: "#db2777" },
      { nome: "Observador", categoria: "observador", cor: "#2563eb", direitos: { voz_plenaria: "livre" } },
    ],
    valores: {
      "identidade.natureza": "conferencia",
      "identidade.abrangencia": "municipal",
      "delegacao.forma": "indicacao",
      "delegacao.calculo_vagas": "fixo",
      "delegacao.documento_indicacao": "ficha_assinada",
      "delegacao.natos": "lista",
      "elegibilidade.filiacao": "nao",
      "programa.entrada_grupo": "escolha",
      "programa.funcoes_grupo": "eleitas",
      "propostas.max_por_grupo": 20,
      "propostas.max_por_eixo": 5,
      "mocoes.habilitacao": "voto_grupo",
      "encerramento.certificado": "pedido",
    },
  },
  {
    id: "assembleia_simples",
    nome: "Encontro ou assembleia simples",
    descricao: "Todo inscrito é delegado, sem grupos, votação em plenária.",
    unidadeTipo: "base",
    papeis: [
      { nome: "Participante", categoria: "delegado", cor: "#16a34a" },
      { nome: "Convidado", categoria: "convidado", cor: "#7c3aed" },
    ],
    valores: {
      "identidade.natureza": "encontro",
      "identidade.abrangencia": "local",
      "delegacao.forma": "inscricao_livre",
      "delegacao.calculo_vagas": "sem_limite",
      "programa.tem_grupos": false,
      "mocoes.minimo_percentual": 10,
    },
  },
  {
    id: "em_branco",
    nome: "Em branco",
    descricao: "Só os padrões do sistema; a comissão ajusta tudo.",
    unidadeTipo: "base",
    papeis: [
      { nome: "Delegado", categoria: "delegado", cor: "#16a34a" },
      { nome: "Observador", categoria: "observador", cor: "#2563eb" },
    ],
    valores: {},
  },
]

/** Configuração inicial a partir de um modelo. */
export function configDoModelo(modeloId: string): ConfigCongresso {
  const m = MODELOS.find((x) => x.id === modeloId) ?? MODELOS[MODELOS.length - 1]
  const valores = { ...valoresPadrao(), ...m.valores }
  const origem = Object.fromEntries(
    Object.keys(valores).map((k) => [k, k in m.valores ? "modelo" : "padrao"])
  )
  return normalizarConfig({ valores, origem, modelo: m.id })
}

/** Cópia da configuração de outra edição: valores mantidos, origem "copia", datas zeradas. */
export function configCopiada(origem: ConfigCongresso): ConfigCongresso {
  const valores: Record<string, ValorAjuste> = {}
  const orig: Record<string, string> = {}
  for (const [k, v] of Object.entries(origem.valores)) {
    // Datas e prazos são da edição anterior: não servem para a nova.
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) continue
    valores[k] = v
    orig[k] = origem.origem[k] === "padrao" ? "padrao" : "copia"
  }
  return normalizarConfig({ valores, origem: orig, artigos: origem.artigos, modelo: origem.modelo })
}

// ── Vagas por base ───────────────────────────────────────────────────────────

export type ExplicacaoVagas = { vagas: number | null; explicacao: string }

/**
 * Vagas de delegado de uma base. `null` = sem limite.
 * Coeficiente: mínimo + 1 a cada N sócios, com a regra da fração.
 */
export function vagasDaBase(
  config: ConfigCongresso,
  base: { limite_delegados: number | null; socios: number | null }
): ExplicacaoVagas {
  const forma = valor<string>(config, "delegacao.forma")
  const calculo = valor<string>(config, "delegacao.calculo_vagas")
  if (forma === "inscricao_livre" || calculo === "sem_limite") {
    return { vagas: null, explicacao: "Sem limite de delegados." }
  }
  if (calculo === "fixo") {
    if (base.limite_delegados === null) return { vagas: null, explicacao: "Limite não informado nesta base." }
    return { vagas: base.limite_delegados, explicacao: `${base.limite_delegados} vaga(s), definidas para a base.` }
  }
  const minimo = Number(valor(config, "delegacao.coef_minimo") ?? 0)
  const aCada = Math.max(1, Number(valor(config, "delegacao.coef_a_cada") ?? 1))
  const fracao = valor<string>(config, "delegacao.coef_fracao")
  if (base.socios === null) return { vagas: null, explicacao: "Informe o número de sócios para calcular as vagas." }
  const inteiras = Math.floor(base.socios / aCada)
  const resto = base.socios % aCada
  let extra = 0
  if (resto > 0) {
    if (fracao === "arredonda_cima") extra = 1
    else if (fracao === "metade_mais_um" && resto > aCada / 2) extra = 1
  }
  const vagas = minimo + inteiras + extra
  const partes = [
    minimo > 0 ? `${minimo} fixo(s)` : null,
    `${inteiras} por ${base.socios} sócios ÷ ${aCada}`,
    extra ? "+1 pela fração" : resto > 0 ? "fração desprezada" : null,
  ].filter(Boolean)
  return { vagas, explicacao: `${vagas} vaga(s): ${partes.join(", ")}.` }
}

// ── Ordem de inscrição e lista de espera ─────────────────────────────────────

export type InscritoParaAlocar = {
  id: string
  inscrito_em: string
  situacao: string
  ocupaVaga: boolean
}

export type Alocacao = { id: string; situacao: "confirmado" | "lista_espera" | "recusado"; posicao: number | null }

/**
 * Distribui as vagas de uma base pela ordem de inscrição. Quem não ocupa vaga
 * (nato, quando a configuração diz) não entra na conta. Cancelados e recusados
 * à mão ficam de fora. Devolve só quem ocupa vaga.
 */
export function alocarPorOrdem(
  inscritos: InscritoParaAlocar[],
  vagas: number | null,
  excedente: "lista_espera" | "recusa" | "comissao"
): Alocacao[] {
  const elegiveis = inscritos
    .filter((i) => i.ocupaVaga && i.situacao !== "cancelado" && i.situacao !== "recusado")
    .sort((a, b) => a.inscrito_em.localeCompare(b.inscrito_em) || a.id.localeCompare(b.id))
  return elegiveis.map((i, n) => {
    if (vagas === null || n < vagas) return { id: i.id, situacao: "confirmado", posicao: null }
    if (excedente === "recusa") return { id: i.id, situacao: "recusado", posicao: null }
    return { id: i.id, situacao: "lista_espera", posicao: n - vagas + 1 }
  })
}

// ── Cotas ────────────────────────────────────────────────────────────────────

export type ResultadoCota = {
  ok: boolean
  exigido: number
  contagem: Record<string, number>
  semInformacao: number
  mensagem: string
}

/** Mínimo de pessoas por gênero, com o arredondamento configurado. */
export function minimoDaCota(total: number, percentual: number, arredondamento: string): number {
  const bruto = (total * percentual) / 100
  if (arredondamento === "baixo") return Math.floor(bruto)
  if (arredondamento === "proximo") return Math.round(bruto)
  return Math.ceil(bruto - 1e-9)
}

/**
 * Confere a cota de gênero de um grupo de delegados. Gêneros considerados:
 * os que aparecem nos dados (cada um precisa atingir o mínimo quando há pelo
 * menos dois gêneros possíveis: feminino e masculino).
 */
export function conferirCotaGenero(
  config: ConfigCongresso,
  generos: (string | null)[]
): ResultadoCota | null {
  const percentual = Number(valor(config, "cotas.genero_minimo") ?? 0)
  if (!percentual) return null
  const total = generos.length
  if (total === 0) return null
  const exigido = minimoDaCota(total, percentual, valor<string>(config, "cotas.arredondamento"))
  const contagem: Record<string, number> = { feminino: 0, masculino: 0 }
  let semInformacao = 0
  for (const g of generos) {
    const k = normalizarGenero(g)
    if (!k) semInformacao++
    else contagem[k] = (contagem[k] ?? 0) + 1
  }
  const faltam = ["feminino", "masculino"].filter((k) => (contagem[k] ?? 0) < exigido)
  const ok = faltam.length === 0
  const mensagem = ok
    ? `Cota cumprida: mínimo de ${exigido} de cada gênero em ${total}.`
    : `Faltam ${faltam.map((k) => `${exigido - (contagem[k] ?? 0)} ${k === "feminino" ? "mulher(es)" : "homem(ns)"}`).join(" e ")} para o mínimo de ${percentual}% (${exigido} de ${total}).` +
      (semInformacao ? ` ${semInformacao} sem gênero informado.` : "")
  return { ok, exigido, contagem, semInformacao, mensagem }
}

export function normalizarGenero(g: string | null): string | null {
  if (!g) return null
  const s = g.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()
  if (!s) return null
  if (["f", "feminino", "mulher", "fem"].includes(s)) return "feminino"
  if (["m", "masculino", "homem", "masc"].includes(s)) return "masculino"
  return s
}

// ── Conferência de consistência ──────────────────────────────────────────────

export type Alerta = { nivel: "erro" | "aviso"; mensagem: string; secao?: string }

export type DadosConsistencia = {
  config: ConfigCongresso
  eventoInicio: string | null
  eventoTermino: string | null
  papeis: { nome: string; categoria: CategoriaPapel }[]
  unidades: { nome: string; limite_delegados: number | null; socios: number | null }[]
  grupos: { nome: string; vagas: number | null }[]
  temParticipanteSemBase: boolean
}

function data(v: ValorAjuste): number | null {
  if (typeof v !== "string") return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

/** Contradições e lacunas da configuração, para mostrar antes do evento. */
export function conferirConsistencia(d: DadosConsistencia): Alerta[] {
  const c = d.config
  const alertas: Alerta[] = []
  const forma = valor<string>(c, "delegacao.forma")
  const calculo = valor<string>(c, "delegacao.calculo_vagas")

  const temDelegado = d.papeis.some((p) => p.categoria === "delegado" || p.categoria === "nato")
  if (!temDelegado) alertas.push({ nivel: "erro", mensagem: "Nenhum papel de delegado: ninguém vota.", secao: "papeis" })

  if (valor(c, "delegacao.natos") !== "nenhum" && !d.papeis.some((p) => p.categoria === "nato")) {
    alertas.push({ nivel: "aviso", mensagem: "A configuração prevê natos, mas não há papel de delegado nato.", secao: "papeis" })
  }
  if (Number(valor(c, "delegacao.suplentes_por_titular")) > 0 && !d.papeis.some((p) => p.categoria === "suplente")) {
    alertas.push({ nivel: "aviso", mensagem: "Há suplentes por titular, mas não há papel de suplente.", secao: "papeis" })
  }

  const precisaBases = forma === "ordem_inscricao" || forma === "indicacao" || forma === "eleicao_base"
  if (precisaBases && calculo !== "sem_limite" && d.unidades.length === 0) {
    alertas.push({ nivel: "aviso", mensagem: "Cadastre as bases ou entidades: o limite de delegados é por base.", secao: "delegacao" })
  }
  if (calculo === "fixo") {
    const sem = d.unidades.filter((u) => u.limite_delegados === null)
    if (sem.length) alertas.push({ nivel: "aviso", mensagem: `Sem limite de delegados: ${sem.map((u) => u.nome).join(", ")}.`, secao: "delegacao" })
  }
  if (calculo === "coeficiente") {
    const sem = d.unidades.filter((u) => u.socios === null)
    if (sem.length) alertas.push({ nivel: "aviso", mensagem: `Sem número de sócios para calcular as vagas: ${sem.map((u) => u.nome).join(", ")}.`, secao: "delegacao" })
  }
  if (d.temParticipanteSemBase && precisaBases && d.unidades.length > 0) {
    alertas.push({ nivel: "aviso", mensagem: "Há delegados sem base: eles ficam fora do limite e das cotas por base.", secao: "participantes" })
  }

  if (valor(c, "mocoes.percentual_de") === "base_origem" && valor(c, "mocoes.habilitacao") === "assinaturas" && d.unidades.length === 0) {
    alertas.push({ nivel: "aviso", mensagem: "A moção usa percentual da base de origem, mas não há bases cadastradas.", secao: "mocoes" })
  }
  if (Number(valor(c, "cotas.genero_minimo")) > 0 && !valor(c, "inscricao.pede_genero")) {
    alertas.push({ nivel: "aviso", mensagem: "Há cota de gênero, mas a inscrição não pergunta o gênero.", secao: "inscricao" })
  }

  const abre = data(valor(c, "inscricao.abre"))
  const fecha = data(valor(c, "inscricao.fecha"))
  if (abre !== null && fecha !== null && fecha <= abre) {
    alertas.push({ nivel: "erro", mensagem: "As inscrições fecham antes de abrir.", secao: "inscricao" })
  }
  const inicio = d.eventoInicio ? Date.parse(d.eventoInicio) : null
  const termino = d.eventoTermino ? Date.parse(d.eventoTermino) : null
  if (fecha !== null && termino !== null && fecha > termino) {
    alertas.push({ nivel: "aviso", mensagem: "As inscrições fecham depois do fim do evento.", secao: "inscricao" })
  }
  const titular = data(valor(c, "credenciamento.titular_ate"))
  const suplente = data(valor(c, "credenciamento.suplente_ate"))
  if (titular !== null && suplente !== null && suplente < titular) {
    alertas.push({ nivel: "aviso", mensagem: "O prazo dos suplentes termina antes do prazo dos titulares.", secao: "credenciamento" })
  }
  const prazoMocao = data(valor(c, "mocoes.prazo"))
  if (prazoMocao !== null && inicio !== null && termino !== null && (prazoMocao < inicio || prazoMocao > termino)) {
    alertas.push({ nivel: "aviso", mensagem: "O prazo das moções está fora do período do evento.", secao: "mocoes" })
  }
  for (const [chave, rotulo] of [
    ["credenciamento.titular_ate", "credenciamento dos titulares"],
    ["credenciamento.suplente_ate", "credenciamento dos suplentes"],
  ] as const) {
    const t = data(valor(c, chave))
    if (t !== null && termino !== null && t > termino) {
      alertas.push({ nivel: "aviso", mensagem: `O prazo de ${rotulo} passa do fim do evento.`, secao: "credenciamento" })
    }
  }

  if (valor(c, "programa.tem_grupos") && d.grupos.length === 0) {
    alertas.push({ nivel: "aviso", mensagem: "A configuração prevê grupos de trabalho, mas nenhum foi cadastrado.", secao: "programa" })
  }
  if (valor(c, "programa.entrada_grupo") === "escolha" && d.grupos.some((g) => g.vagas === null)) {
    alertas.push({ nivel: "aviso", mensagem: "A pessoa escolhe o grupo com vagas, mas há grupos sem número de vagas.", secao: "programa" })
  }
  if (valor(c, "identidade.formato") === "presencial") {
    const remotos = (["local.voto_plenaria", "local.assinatura_mocao", "local.eleicao"] as const).filter(
      (k) => valor(c, k) === "so_distancia"
    )
    if (remotos.length) alertas.push({ nivel: "erro", mensagem: "O evento é presencial, mas há atos marcados como só a distância.", secao: "local" })
  }
  if (valor(c, "identidade.formato") === "virtual") {
    const locais = (["local.voto_plenaria", "local.assinatura_mocao", "local.eleicao"] as const).filter(
      (k) => valor(c, k) === "so_local"
    )
    if (locais.length) alertas.push({ nivel: "erro", mensagem: "O evento é virtual, mas há atos que exigem presença no local.", secao: "local" })
  }
  return alertas
}

// ── Utilitários ──────────────────────────────────────────────────────────────

/** CPF só com dígitos, ou null quando não tem 11 dígitos. */
export function limparCpf(v: string | null | undefined): string | null {
  const d = String(v ?? "").replace(/\D/g, "")
  return d.length === 11 ? d : null
}

// ── Inscrição pública ────────────────────────────────────────────────────────

/** Endereço da página pública: minúsculo, sem acento, hífens. */
export function gerarSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/** A página pública aceita inscrições agora? Devolve o motivo quando não. */
export function inscricaoAberta(d: {
  inscricaoPublica: boolean
  situacao: string
  abre: ValorAjuste
  fecha: ValorAjuste
  agora?: Date
}): { aberta: boolean; motivo?: string } {
  const agora = (d.agora ?? new Date()).getTime()
  if (!d.inscricaoPublica) return { aberta: false, motivo: "A inscrição por este link não está aberta." }
  if (d.situacao === "cancelado") return { aberta: false, motivo: "Este congresso foi cancelado." }
  if (d.situacao === "encerrado") return { aberta: false, motivo: "Este congresso já foi encerrado." }
  const abre = data(d.abre)
  const fecha = data(d.fecha)
  if (abre !== null && agora < abre) return { aberta: false, motivo: "As inscrições ainda não começaram." }
  if (fecha !== null && agora > fecha) return { aberta: false, motivo: "As inscrições estão encerradas." }
  return { aberta: true }
}

/**
 * Situação de quem acaba de se inscrever. Por ordem de inscrição, ocupa a vaga
 * se ainda houver; senão, vai para a espera (ou é recusado). Quando a comissão
 * aprova cada inscrição, ou a forma é indicação/eleição, fica "inscrito".
 */
export function situacaoNaInscricao(d: {
  config: ConfigCongresso
  ocupaVaga: boolean
  vagas: number | null
  ocupadas: number
}): "inscrito" | "confirmado" | "lista_espera" | "recusado" {
  if (valor(d.config, "inscricao.aprovacao") === "comissao") return "inscrito"
  const forma = valor<string>(d.config, "delegacao.forma")
  if (!d.ocupaVaga) return "confirmado"
  if (forma === "inscricao_livre") return "confirmado"
  if (forma !== "ordem_inscricao") return "inscrito"
  if (d.vagas === null || d.ocupadas < d.vagas) return "confirmado"
  const excedente = valor<string>(d.config, "delegacao.lista_espera")
  if (excedente === "recusa") return "recusado"
  if (excedente === "comissao") return "inscrito"
  return "lista_espera"
}
