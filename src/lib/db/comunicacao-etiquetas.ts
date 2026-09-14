import "server-only"

import { esquemaAusente, nomesDosUsuarios } from "@/lib/db/comum"
import {
  baseRelatorios,
  filtrarRelatorio,
  type BaseRelatorios,
  type LinhaRelatorio,
} from "@/lib/db/filiacao-relatorios"
import {
  areaUtil,
  CONDICAO_SEM,
  CONDICOES_ETIQUETA,
  porFolha,
  type FiltrosEtiquetas,
  type Lote,
  type OpcoesEtiquetas,
} from "@/lib/etiquetas-pimaco"
import {
  blocosDoDestinatario,
  encaixarBlocos,
  faltasDoEndereco,
  normalizarCep,
  type EnderecoPostal,
} from "@/lib/etiquetas-texto"
import type { FolhaDeEtiquetas } from "@/lib/pdf/etiquetas"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comunicação › Etiquetas para os Correios — quem recebe e o registro de cada
 * emissão.
 *
 * Os destinatários saem da MESMA base dos relatórios de filiados (cadastro +
 * vínculo corrente, guardada 10 min por tenant), com a condição sindical em
 * múltipla escolha: a publicação vai para qualquer condição que o usuário
 * marcar. Uma etiqueta por pessoa — cadastros repetidos do mesmo CPF viram
 * uma só. Endereço incompleto não vira etiqueta: fica listado para correção.
 *
 * Endereço de filiado em massa é dado pessoal: cada PDF e CSV baixado fica
 * registrado (quem, quando, quantas, com que recorte).
 * SQL: supabase/comunicacao-etiquetas.sql.
 */

export type Destinatario = {
  id: string
  cpf: string | null
  matricula: string | null
  condicao: string | null
  fonte: string | null
  vinculoAberto: boolean
  endereco: EnderecoPostal
  faltas: string[]
}

export type SelecaoEtiquetas = {
  base: BaseRelatorios
  /** Filiados do recorte (antes de juntar CPFs repetidos). */
  noRecorte: number
  cpfsRepetidos: number
  comEndereco: Destinatario[]
  semEndereco: Destinatario[]
}

function destinatario(l: LinhaRelatorio): Destinatario {
  const endereco: EnderecoPostal = {
    nome: l.nomeSocial ?? l.nome,
    logradouro: l.logradouro,
    numero: l.numero,
    complemento: l.complemento,
    bairro: l.bairro,
    cidade: l.cidade,
    uf: l.uf ?? l.ufBruta,
    cep: l.cep,
  }
  return {
    id: l.id,
    cpf: l.cpf,
    matricula: l.matricula,
    condicao: l.condicao,
    fonte: l.fonte,
    vinculoAberto: l.vinculoAberto,
    endereco,
    faltas: faltasDoEndereco(endereco),
  }
}

/** Entre dois cadastros do mesmo CPF, qual vira a etiqueta. */
function melhor(a: Destinatario, b: Destinatario): Destinatario {
  if ((a.faltas.length === 0) !== (b.faltas.length === 0)) return a.faltas.length === 0 ? a : b
  if (a.vinculoAberto !== b.vinculoAberto) return a.vinculoAberto ? a : b
  if ((a.condicao === "Ativo") !== (b.condicao === "Ativo")) return a.condicao === "Ativo" ? a : b
  return a
}

export async function selecionarDestinatarios(
  filtros: FiltrosEtiquetas
): Promise<SelecaoEtiquetas> {
  const base = await baseRelatorios()
  const condicoes = new Set(filtros.condicoes)
  const linhas = filtrarRelatorio(base, {
    busca: filtros.busca,
    situacao: filtros.situacao,
    condicao: "todas",
    fonte: filtros.fonte,
    condicaoFonte: filtros.condicaoFonte,
    uf: filtros.uf,
    cidade: filtros.cidade,
  }).filter((l) => (l.condicao ? condicoes.has(l.condicao) : condicoes.has(CONDICAO_SEM)))

  const porCpf = new Map<string, Destinatario>()
  const semCpf: Destinatario[] = []
  for (const l of linhas) {
    const d = destinatario(l)
    const cpf = d.cpf?.replace(/\D/g, "")
    if (!cpf) {
      semCpf.push(d)
      continue
    }
    const atual = porCpf.get(cpf)
    porCpf.set(cpf, atual ? melhor(atual, d) : d)
  }
  const todos = [...porCpf.values(), ...semCpf]

  const nome = (d: Destinatario) => (d.endereco.nome ?? "").toLocaleLowerCase("pt-BR")
  const comparar = (a: Destinatario, b: Destinatario) => {
    if (filtros.ordem === "cidade") {
      const porCidade = `${a.endereco.uf ?? ""} ${a.endereco.cidade ?? ""}`.localeCompare(
        `${b.endereco.uf ?? ""} ${b.endereco.cidade ?? ""}`,
        "pt-BR",
        { sensitivity: "base" }
      )
      if (porCidade !== 0) return porCidade
    } else if (filtros.ordem !== "nome") {
      // CEP crescente: é a ordem da triagem dos Correios.
      const porCep = (normalizarCep(a.endereco.cep) ?? "").localeCompare(normalizarCep(b.endereco.cep) ?? "")
      if (porCep !== 0) return porCep
    }
    return nome(a).localeCompare(nome(b), "pt-BR")
  }

  return {
    base,
    noRecorte: linhas.length,
    cpfsRepetidos: linhas.length - todos.length,
    comEndereco: todos.filter((d) => d.faltas.length === 0).sort(comparar),
    semEndereco: todos.filter((d) => d.faltas.length > 0).sort((a, b) => nome(a).localeCompare(nome(b), "pt-BR")),
  }
}

/** Texto legível do recorte, para o registro da emissão e o CSV. */
export function descreverRecorte(filtros: FiltrosEtiquetas, base: BaseRelatorios): string {
  const rotuloCondicao = (c: string) => CONDICOES_ETIQUETA.find((x) => x.valor === c)?.rotulo ?? c
  const partes = [`Condição: ${filtros.condicoes.map(rotuloCondicao).join(", ")}`]
  if (filtros.situacao !== "ativas") {
    partes.push(filtros.situacao === "excluidas" ? "Só excluídos do quadro" : "Inclui excluídos do quadro")
  }
  if (filtros.fonte && filtros.fonte !== "todas") {
    partes.push(`Fonte: ${base.fontes.find((f) => f.id === filtros.fonte)?.nome ?? filtros.fonte}`)
  }
  if (filtros.condicaoFonte && filtros.condicaoFonte !== "todas") partes.push(filtros.condicaoFonte)
  if (filtros.uf && filtros.uf !== "todas") partes.push(`UF: ${filtros.uf}`)
  if (filtros.cidade) partes.push(`Cidade contém "${filtros.cidade}"`)
  if (filtros.busca) partes.push(`Busca "${filtros.busca}"`)
  return partes.join(" · ")
}

/**
 * Distribui as etiquetas de um lote nas posições das folhas. Na primeira
 * folha do trabalho, as posições antes de `inicio` ficam em branco.
 */
export function folhasDoLote(
  destinatarios: Destinatario[],
  opcoes: OpcoesEtiquetas,
  lote: Lote
): FolhaDeEtiquetas[] {
  const { modelo } = opcoes
  const pf = porFolha(modelo)
  const area = areaUtil(modelo)
  const brancas = lote.numero === 1 ? opcoes.inicio - 1 : 0
  const doLote = destinatarios.slice(lote.de - 1, lote.ate)
  const folhas: FolhaDeEtiquetas[] = []
  for (let f = 0; f < lote.folhas; f++) {
    const posicoes: FolhaDeEtiquetas["posicoes"] = []
    for (let p = 0; p < pf; p++) {
      const indice = f * pf + p - brancas
      const d = indice >= 0 ? doLote[indice] : undefined
      posicoes.push(d ? encaixarDestinatario(d, opcoes, area) : null)
    }
    folhas.push({ posicoes })
  }
  return folhas
}

export function encaixarDestinatario(
  d: Destinatario,
  opcoes: Pick<OpcoesEtiquetas, "caixaAlta" | "matricula">,
  area: ReturnType<typeof areaUtil>
) {
  return encaixarBlocos(
    blocosDoDestinatario(d.endereco, {
      caixaAlta: opcoes.caixaAlta,
      referencia: opcoes.matricula && d.matricula ? `Mat. ${d.matricula}` : null,
    }),
    area.largura,
    area.altura,
    area.corpoMaximo
  )
}

// ── Registro das emissões ───────────────────────────────────────────────────

export type TipoEmissao = "pdf" | "csv"

export type Emissao = {
  id: string
  tipo: TipoEmissao
  modelo: string | null
  lote: string | null
  quantidade: number
  recorte: string | null
  usuarioNome: string | null
  created_at: string
}

export async function registrarEmissao(dados: {
  usuarioId: string
  tipo: TipoEmissao
  modelo?: string | null
  lote?: string | null
  quantidade: number
  recorte?: string | null
}): Promise<void> {
  const admin = await createAdminClient()
  const { error } = await admin.from("comunicacao_etiquetas_emissoes").insert({
    emp_proprietaria_id: await tenantAtual(),
    usuario_id: dados.usuarioId,
    tipo: dados.tipo,
    modelo: dados.modelo ?? null,
    lote: dados.lote ?? null,
    quantidade: dados.quantidade,
    recorte: dados.recorte ?? null,
  })
  // Sem a tabela (SQL não rodado) a emissão segue; a tela avisa.
  if (error && !esquemaAusente(error)) {
    console.error("Falha ao registrar emissão de etiquetas:", error.message)
  }
}

export async function listarEmissoes(limite = 15): Promise<{
  ativo: boolean
  linhas: Emissao[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("comunicacao_etiquetas_emissoes")
    .select("id, tipo, modelo, lote, quantidade, recorte, usuario_id, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, linhas: [] }
    throw new Error(`Falha ao listar emissões de etiquetas: ${error.message}`)
  }
  const nomes = await nomesDosUsuarios(
    (data ?? []).map((e) => e.usuario_id).filter((v): v is string => !!v)
  )
  return {
    ativo: true,
    linhas: (data ?? []).map((e) => ({
      id: e.id as string,
      tipo: e.tipo as TipoEmissao,
      modelo: e.modelo as string | null,
      lote: e.lote as string | null,
      quantidade: (e.quantidade as number | null) ?? 0,
      recorte: e.recorte as string | null,
      usuarioNome: e.usuario_id ? (nomes.get(e.usuario_id) ?? null) : null,
      created_at: e.created_at as string,
    })),
  }
}
