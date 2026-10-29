import "server-only"

import {
  type CampoCadastro,
  type CampoVinculo,
  chaveComparacao,
  chaveMatricula,
  ESPELHO_FONTE,
  type LinhaLista,
  mesmoValor,
  ROTULOS_CAMPO,
} from "@/lib/atualizacao-lista"
import { cpfConfiavel, grafiasDoCpf, limparCpf } from "@/lib/cpf"
import { lerEmLotes, lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { invalidarCacheAtivos } from "@/lib/db/filiacao-ativos"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import { atribuirMatriculaSindical } from "@/lib/db/filiacao-identidade"
import { buscarFontePagadora, invalidarCacheFontes } from "@/lib/db/fontes"
import { invalidarCacheProntuarios } from "@/lib/db/prontuario"
import { condicaoNaFontePadrao, FILIACAO_CONDICOES } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Atualização de cadastros por lista de trabalhadores (29/10/2026). A IA lê a
 * lista (ia-actions da página) e lib/atualizacao-lista.ts padroniza; aqui:
 *
 *  1. `montarRascunho`: acha o cadastro de cada linha (CPF → matrícula na
 *     fonte → nome exato, este só como sugestão) e grava a prévia — cada
 *     campo que mudaria, com o valor atual e o novo. Campo vazio no cadastro
 *     vem marcado; valor diferente, desmarcado.
 *  2. `aplicarLote`: grava o que foi marcado. Um campo que mudou depois da
 *     prévia não é sobrescrito (conflito).
 *  3. `desfazerLote`: devolve o valor anterior onde o campo ainda está com o
 *     valor do lote.
 *  4. `cadastrarNaoEncontrados`: quem não tinha cadastro, se a gestão quiser.
 * CPF, condição sindical, datas de filiação e termos nunca vêm da lista.
 */

const LOTE = "filiacao_atualizacoes_lote"
const ITENS = "filiacao_atualizacoes_lote_itens"

const CAMPOS_CADASTRO: CampoCadastro[] = [
  "nome_completo",
  "nascimento_data",
  "sexo",
  "email_pessoal",
  "email_corporativo",
  "telefone_1",
  "telefone_2",
  "endereco_cep",
  "endereco_logradouro",
  "endereco_numero",
  "endereco_complemento",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_estado",
]
const CAMPOS_VINCULO: CampoVinculo[] = [
  "matricula",
  "cargo",
  "lotacao",
  "data_entrada_admissao",
  "data_saida_demissao",
  "regime_trabalho",
  "condicao_na_fonte",
]
const COLS_VINCULO = [
  "id",
  "filiado_id",
  "created_at",
  ...CAMPOS_VINCULO,
  ...Object.values(ESPELHO_FONTE),
].join(", ")

export type Via = "cpf" | "matricula" | "nome"

export type Descartada = { linha: number; nome: string | null; motivo: string }

/** Linha válida sem cadastro: o que é preciso para cadastrá-la depois. */
export type NaoEncontrado = {
  linha: number
  nome: string | null
  cpf: string | null
  matricula: string | null
  cadastro: LinhaLista["cadastro"]
  vinculo: LinhaLista["vinculo"]
  cadastradoId?: string
}

export type ItemLote = {
  seq: number
  acompanha: number | null
  linha: number | null
  filiadoId: string
  vinculoId: string | null
  via: Via
  tabela: "filiacoes" | "filiacao_vinculos"
  campo: string
  anterior: string | null
  novo: string | null
  marcadoPadrao: boolean
  aplicado: boolean
  desfeito: boolean
}

export type Lote = {
  id: string
  fonteId: string | null
  fonteNome: string | null
  arquivo: string
  situacao: "rascunho" | "aplicado" | "desfeito"
  linhasLidas: number
  descartadas: Descartada[]
  naoEncontrados: NaoEncontrado[]
  avisos: string[]
  resumo: Record<string, number> | null
  criadoPorNome: string | null
  criadoEm: string
  aplicadoEm: string | null
  desfeitoEm: string | null
}

/** Roda `tarefa` em cada item, no máximo `limite` ao mesmo tempo. */
async function emParalelo<T>(itens: T[], limite: number, tarefa: (item: T) => Promise<void>) {
  let proximo = 0
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (proximo < itens.length) await tarefa(itens[proximo++])
    })
  )
}

const comoTexto = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v)

// ── 1. Prévia ────────────────────────────────────────────────────────────────

export async function montarRascunho(entrada: {
  fonteId: string | null
  arquivo: string
  linhas: LinhaLista[]
  descartadas: Descartada[]
  avisos: string[]
  linhasLidas: number
  usuario: { id: string; nome: string | null }
}): Promise<{ loteId?: string; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { fonteId } = entrada
  const descartadas = [...entrada.descartadas]
  const avisos = [...entrada.avisos]

  // Cadastros do tenant (não excluídos nem mesclados) para casar CPF e nome.
  const cadastros = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    admin
      .from("filiacoes")
      .select("id, cpf, nome_completo, filiacao_condicao, created_at")
      .eq("emp_proprietaria_id", emp)
      .not("filiacao_excluida", "is", true)
      .is("mesclado_em", null)
      .order("id", { ascending: true })
      .range(de, ate)
  )
  const vinculosFonte = fonteId
    ? await lerEmLotes<Record<string, unknown>>((de, ate) =>
        admin
          .from("filiacao_vinculos")
          .select("id, filiado_id, matricula, fonte_pg_matricula, data_desfiliacao, filiacao_data_saida, created_at")
          .eq("emp_proprietaria_id", emp)
          .eq("fonte_pagadora_id", fonteId)
          .not("filiado_id", "is", null)
          .order("id", { ascending: true })
          .range(de, ate)
      )
    : []
  const comVinculoAberto = new Set(
    vinculosFonte.filter((v) => !v.data_desfiliacao && !v.filiacao_data_saida).map((v) => String(v.filiado_id))
  )

  // Mais de um registro do mesmo CPF: vale o que tem vínculo aberto na
  // fonte, depois o Ativo, depois o mais recente.
  const peso = (c: Record<string, unknown>) =>
    (comVinculoAberto.has(String(c.id)) ? 4 : 0) + (c.filiacao_condicao === "Ativo" ? 2 : 0)
  const porCpf = new Map<string, Record<string, unknown>>()
  const porNome = new Map<string, string | null>()
  for (const c of cadastros) {
    const cpf = limparCpf(String(c.cpf ?? ""))
    if (cpf.length === 11) {
      const atual = porCpf.get(cpf)
      if (
        !atual ||
        peso(c) > peso(atual) ||
        (peso(c) === peso(atual) && String(c.created_at ?? "") > String(atual.created_at ?? ""))
      ) {
        porCpf.set(cpf, c)
      }
    }
    const nome = chaveComparacao(texto(c.nome_completo))
    if (nome) porNome.set(nome, porNome.has(nome) && porNome.get(nome) !== String(c.id) ? null : String(c.id))
  }
  // Matrícula na fonte → pessoa, só quando aponta para uma pessoa só.
  const porMatricula = new Map<string, string | null>()
  for (const v of vinculosFonte) {
    for (const m of [v.matricula, v.fonte_pg_matricula]) {
      const chave = chaveMatricula(texto(m))
      if (!chave) continue
      const id = String(v.filiado_id)
      porMatricula.set(chave, porMatricula.has(chave) && porMatricula.get(chave) !== id ? null : id)
    }
  }

  type Casada = { linha: LinhaLista; filiadoId: string; via: Via }
  const casadas: Casada[] = []
  const naoEncontrados: NaoEncontrado[] = []
  const vistos = new Set<string>()
  for (const l of entrada.linhas) {
    let filiadoId: string | null = null
    let via: Via | null = null
    if (l.cpf && porCpf.has(l.cpf)) {
      filiadoId = String(porCpf.get(l.cpf)!.id)
      via = "cpf"
    } else if (l.matricula && porMatricula.get(chaveMatricula(l.matricula))) {
      filiadoId = porMatricula.get(chaveMatricula(l.matricula))!
      via = "matricula"
    } else if (!l.cpf && l.nome && porNome.get(chaveComparacao(l.nome))) {
      // Por nome só sem CPF na linha: CPF que não casou é outra pessoa.
      filiadoId = porNome.get(chaveComparacao(l.nome))!
      via = "nome"
    }
    if (!filiadoId || !via) {
      naoEncontrados.push({
        linha: l.linha,
        nome: l.nome,
        cpf: l.cpf,
        matricula: l.matricula,
        cadastro: l.cadastro,
        vinculo: l.vinculo,
      })
      continue
    }
    if (vistos.has(filiadoId)) {
      descartadas.push({ linha: l.linha, nome: l.nome, motivo: "A mesma pessoa já apareceu em outra linha da lista." })
      continue
    }
    vistos.add(filiadoId)
    casadas.push({ linha: l, filiadoId, via })
  }

  // Valores atuais dos cadastros casados e do vínculo aberto na fonte.
  const ids = casadas.map((c) => c.filiadoId)
  const atuais = new Map<string, Record<string, unknown>>()
  for (const f of await lerEmLotesPorIds<Record<string, unknown>>(ids, (fatia, de, ate) =>
    admin
      .from("filiacoes")
      .select(["id", ...CAMPOS_CADASTRO].join(", "))
      .in("id", fatia)
      .order("id", { ascending: true })
      .range(de, ate)
  )) {
    atuais.set(String(f.id), f)
  }
  const vinculoAberto = new Map<string, Record<string, unknown>>()
  if (fonteId && ids.length) {
    const vinculos = await lerEmLotesPorIds<Record<string, unknown>>(ids, (fatia, de, ate) =>
      admin
        .from("filiacao_vinculos")
        .select(COLS_VINCULO)
        .in("filiado_id", fatia)
        .eq("fonte_pagadora_id", fonteId)
        .is("data_desfiliacao", null)
        .is("filiacao_data_saida", null)
        .order("id", { ascending: true })
        .range(de, ate)
    )
    for (const v of vinculos) {
      const atual = vinculoAberto.get(String(v.filiado_id))
      if (!atual || String(v.created_at ?? "") > String(atual.created_at ?? "")) vinculoAberto.set(String(v.filiado_id), v)
    }
  }

  // Campo a campo.
  type Novo = Omit<ItemLote, "aplicado" | "desfeito">
  const itens: Novo[] = []
  let seq = 0
  const semVinculo: string[] = []
  const sairam: string[] = []
  for (const { linha: l, filiadoId, via } of casadas) {
    const atual = atuais.get(filiadoId) ?? {}
    const confiavel = via !== "nome"
    const propor = (
      tabela: ItemLote["tabela"],
      vinculoId: string | null,
      campo: string,
      anterior: unknown,
      novo: string,
      opcoes: { nuncaMarcar?: boolean } = {}
    ): number | null => {
      if (mesmoValor(campo, comoTexto(anterior), novo)) return null
      const vazio = comoTexto(anterior) === null
      itens.push({
        seq: ++seq,
        acompanha: null,
        linha: l.linha,
        filiadoId,
        vinculoId,
        via,
        tabela,
        campo,
        anterior: comoTexto(anterior),
        novo,
        marcadoPadrao: confiavel && vazio && !opcoes.nuncaMarcar,
      })
      return seq
    }

    // Telefones: número que já está num dos dois campos não muda nada; o
    // novo vai para o primeiro campo vazio (ou é proposto no 2, desmarcado).
    const telefones = [l.cadastro.telefone_1, l.cadastro.telefone_2].filter((t): t is string => Boolean(t))
    const jaTem = new Set([atual.telefone_1, atual.telefone_2].map((t) => String(t ?? "").replace(/\D/g, "")).filter(Boolean))
    const livres = (["telefone_1", "telefone_2"] as const).filter((c) => !comoTexto(atual[c]))
    for (const t of telefones.filter((t) => !jaTem.has(t))) {
      const campo = livres.shift() ?? "telefone_2"
      propor("filiacoes", null, campo, atual[campo], t)
    }

    for (const campo of CAMPOS_CADASTRO) {
      if (campo === "telefone_1" || campo === "telefone_2") continue
      const novo = l.cadastro[campo]
      if (!novo) continue
      // Nome só muda por decisão de quem confere: a lista pode abreviar.
      propor("filiacoes", null, campo, atual[campo], novo, { nuncaMarcar: campo === "nome_completo" })
    }

    const temDadosVinculo = CAMPOS_VINCULO.some((c) => l.vinculo[c])
    if (l.vinculo.data_saida_demissao) sairam.push(l.nome ?? `linha ${l.linha}`)
    if (!fonteId || !temDadosVinculo) continue
    const v = vinculoAberto.get(filiadoId)
    if (!v) {
      semVinculo.push(l.nome ?? `linha ${l.linha}`)
      continue
    }
    for (const campo of CAMPOS_VINCULO) {
      const novo = l.vinculo[campo]
      if (!novo) continue
      const principal = propor("filiacao_vinculos", String(v.id), campo, v[campo], novo)
      const espelho = ESPELHO_FONTE[campo]
      if (principal !== null && espelho && !mesmoValor(espelho, comoTexto(v[espelho]), novo)) {
        itens.push({
          seq: ++seq,
          acompanha: principal,
          linha: l.linha,
          filiadoId,
          vinculoId: String(v.id),
          via,
          tabela: "filiacao_vinculos",
          campo: espelho,
          anterior: comoTexto(v[espelho]),
          novo,
          marcadoPadrao: false,
        })
      }
    }
  }

  const lista = (nomes: string[]) => nomes.slice(0, 30).join(", ") + (nomes.length > 30 ? ` e mais ${nomes.length - 30}` : "")
  if (!fonteId && casadas.some((c) => CAMPOS_VINCULO.some((k) => c.linha.vinculo[k]))) {
    avisos.push("A lista traz dados do emprego (cargo, lotação, matrícula…), mas nenhuma fonte pagadora foi escolhida: só os dados pessoais podem ser atualizados.")
  }
  if (semVinculo.length) {
    avisos.push(`${semVinculo.length} pessoa(s) encontrada(s) sem vínculo em aberto nesta fonte — os dados do emprego delas ficam de fora: ${lista(semVinculo)}.`)
  }
  if (sairam.length) {
    avisos.push(`${sairam.length} pessoa(s) com data de saída da empresa na lista. A filiação não muda sozinha — avalie a desfiliação: ${lista(sairam)}.`)
  }

  const { data: lote, error } = await admin
    .from(LOTE)
    .insert({
      emp_proprietaria_id: emp,
      fonte_pagadora_id: fonteId,
      arquivo_nome: entrada.arquivo.slice(0, 200),
      linhas_lidas: entrada.linhasLidas,
      descartadas,
      nao_encontrados: naoEncontrados,
      avisos,
      criado_por: entrada.usuario.id,
      criado_por_nome: entrada.usuario.nome,
    })
    .select("id")
    .single()
  if (error || !lote) return { erro: `Falha ao guardar a prévia: ${error?.message ?? "sem retorno"}` }

  for (let de = 0; de < itens.length; de += 500) {
    const { error: e } = await admin.from(ITENS).insert(
      itens.slice(de, de + 500).map((i) => ({
        lote_id: lote.id,
        emp_proprietaria_id: emp,
        seq: i.seq,
        acompanha: i.acompanha,
        linha: i.linha,
        filiado_id: i.filiadoId,
        vinculo_id: i.vinculoId,
        via: i.via,
        tabela: i.tabela,
        campo: i.campo,
        valor_anterior: i.anterior,
        valor_novo: i.novo,
        marcado_padrao: i.marcadoPadrao,
      }))
    )
    if (e) {
      await admin.from(LOTE).delete().eq("id", lote.id)
      return { erro: `Falha ao guardar a prévia: ${e.message}` }
    }
  }
  return { loteId: String(lote.id) }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

function mapearLote(l: Record<string, unknown>, fonteNome: string | null): Lote {
  return {
    id: String(l.id),
    fonteId: texto(l.fonte_pagadora_id),
    fonteNome,
    arquivo: String(l.arquivo_nome ?? ""),
    situacao: l.situacao as Lote["situacao"],
    linhasLidas: Number(l.linhas_lidas ?? 0),
    descartadas: (l.descartadas as Descartada[]) ?? [],
    naoEncontrados: (l.nao_encontrados as NaoEncontrado[]) ?? [],
    avisos: (l.avisos as string[]) ?? [],
    resumo: (l.resumo as Record<string, number> | null) ?? null,
    criadoPorNome: texto(l.criado_por_nome),
    criadoEm: String(l.created_at),
    aplicadoEm: texto(l.aplicado_em),
    desfeitoEm: texto(l.desfeito_em),
  }
}

async function nomeDaFonte(fonteId: string | null): Promise<string | null> {
  if (!fonteId) return null
  const admin = await createAdminClient()
  const { data: f } = await admin.from("empresa").select("nome_fantasia, nome_razao").eq("id", fonteId).maybeSingle()
  return f ? (texto(f.nome_fantasia) ?? texto(f.nome_razao)) : null
}

export async function lerLote(
  loteId: string
): Promise<{ lote: Lote; itens: ItemLote[]; nomes: Map<string, string | null> } | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from(LOTE).select("*").eq("id", loteId).eq("emp_proprietaria_id", await tenantAtual()).maybeSingle()
  if (!data) return null
  const lote = mapearLote(data, await nomeDaFonte(texto(data.fonte_pagadora_id)))
  const itens = (
    await lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin.from(ITENS).select("*").eq("lote_id", loteId).order("seq", { ascending: true }).range(de, ate)
    )
  ).map(
    (i): ItemLote => ({
      seq: Number(i.seq),
      acompanha: i.acompanha === null ? null : Number(i.acompanha),
      linha: i.linha === null ? null : Number(i.linha),
      filiadoId: String(i.filiado_id),
      vinculoId: texto(i.vinculo_id),
      via: i.via as Via,
      tabela: i.tabela as ItemLote["tabela"],
      campo: String(i.campo),
      anterior: texto(i.valor_anterior),
      novo: texto(i.valor_novo),
      marcadoPadrao: i.marcado_padrao === true,
      aplicado: i.aplicado === true,
      desfeito: i.desfeito === true,
    })
  )
  const nomes = new Map<string, string | null>()
  const ids = [...new Set(itens.map((i) => i.filiadoId))]
  for (const f of await lerEmLotesPorIds<Record<string, unknown>>(ids, (fatia, de, ate) =>
    admin.from("filiacoes").select("id, nome_completo").in("id", fatia).order("id", { ascending: true }).range(de, ate)
  )) {
    nomes.set(String(f.id), texto(f.nome_completo))
  }
  return { lote, itens, nomes }
}

export async function listarLotes(limite = 30): Promise<Lote[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from(LOTE)
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
    .limit(limite)
  const fontes = new Map<string, string | null>()
  for (const id of new Set((data ?? []).map((l) => texto(l.fonte_pagadora_id)).filter((x): x is string => Boolean(x)))) {
    fontes.set(id, await nomeDaFonte(id))
  }
  return (data ?? []).map((l) => mapearLote(l, fontes.get(String(l.fonte_pagadora_id)) ?? null))
}

// ── 2 e 3. Aplicar e desfazer ────────────────────────────────────────────────

/** Valores gravados de volta no tipo da coluna (telefone e CEP só dígitos). */
function paraColuna(campo: string, v: string | null): string | null {
  if (v === null) return null
  if (["telefone_1", "telefone_2", "endereco_cep"].includes(campo)) return v.replace(/\D/g, "") || null
  return v
}

type Grupo = { tabela: ItemLote["tabela"]; id: string; filiadoId: string; itens: ItemLote[] }

function agrupar(itens: ItemLote[]): Grupo[] {
  const grupos = new Map<string, Grupo>()
  for (const i of itens) {
    const id = i.tabela === "filiacoes" ? i.filiadoId : i.vinculoId
    if (!id) continue
    const chave = `${i.tabela}:${id}`
    const g = grupos.get(chave) ?? { tabela: i.tabela, id, filiadoId: i.filiadoId, itens: [] }
    g.itens.push(i)
    grupos.set(chave, g)
  }
  return [...grupos.values()]
}

/**
 * Lê o registro, aplica `escolher` campo a campo (o que gravar, ou null =
 * conflito) e grava de uma vez. Devolve os itens gravados e os em conflito.
 */
async function gravarGrupo(
  g: Grupo,
  escolher: (item: ItemLote, atual: string | null) => string | null | undefined
): Promise<{ gravados: ItemLote[]; conflitos: ItemLote[]; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const campos = [...new Set(g.itens.map((i) => i.campo))]
  const { data: atual } = await admin.from(g.tabela).select(campos.join(", ")).eq("id", g.id).eq("emp_proprietaria_id", emp).maybeSingle()
  if (!atual) return { gravados: [], conflitos: g.itens }
  const registro = atual as unknown as Record<string, unknown>
  const update: Record<string, unknown> = {}
  const gravados: ItemLote[] = []
  const conflitos: ItemLote[] = []
  for (const i of g.itens) {
    const valor = escolher(i, comoTexto(registro[i.campo]))
    if (valor === undefined) {
      conflitos.push(i)
      continue
    }
    update[i.campo] = paraColuna(i.campo, valor)
    gravados.push(i)
  }
  if (!gravados.length) return { gravados, conflitos }
  if (g.tabela === "filiacoes") update.updated_at = new Date().toISOString()
  const { error } = await admin.from(g.tabela).update(update).eq("id", g.id).eq("emp_proprietaria_id", emp)
  if (error) return { gravados: [], conflitos: [...conflitos, ...gravados], erro: error.message }
  return { gravados, conflitos }
}

async function marcarItens(loteId: string, seqs: number[], valores: Record<string, boolean>) {
  const admin = await createAdminClient()
  for (let de = 0; de < seqs.length; de += 500) {
    await admin.from(ITENS).update(valores).eq("lote_id", loteId).in("seq", seqs.slice(de, de + 500))
  }
}

async function registrarProntuario(porFiliado: Map<string, string[]>, texto: (campos: string) => string, usuarioId: string) {
  if (!porFiliado.size) return
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const agora = new Date().toISOString()
  const linhas = [...porFiliado].map(([filiadoId, campos]) => ({
    filiacao_id: filiadoId,
    data: agora,
    tipo: "Atualização cadastral",
    descricao: texto([...new Set(campos)].join(", ")),
    diretor_funcionario_id: usuarioId,
    emp_proprietaria_id: emp,
    created_at: agora,
    modified_at: agora,
  }))
  for (let de = 0; de < linhas.length; de += 500) {
    const { error } = await admin.from("filiacao_prontuario").insert(linhas.slice(de, de + 500))
    if (error) console.error("Atualização por lista — prontuário:", error.message)
  }
}

function invalidarCaches() {
  invalidarCacheCadastrosPendentes()
  invalidarCacheFontes()
  invalidarCacheAtivos()
  invalidarCacheProntuarios()
}

export async function aplicarLote(
  loteId: string,
  seqsMarcados: number[],
  usuarioId: string
): Promise<{ erro?: string; resumo?: Record<string, number> }> {
  const dados = await lerLote(loteId)
  if (!dados) return { erro: "Lote não encontrado." }
  if (dados.lote.situacao !== "rascunho") return { erro: "Este lote já foi aplicado." }
  const marcados = new Set(seqsMarcados)
  const escolhidos = dados.itens.filter((i) => marcados.has(i.acompanha ?? i.seq))
  if (!escolhidos.length) return { erro: "Nenhum campo marcado." }

  const admin = await createAdminClient()
  // Trava contra duplo clique: só um envio passa de rascunho para aplicado.
  const { data: travou } = await admin
    .from(LOTE)
    .update({ situacao: "aplicado", aplicado_em: new Date().toISOString(), aplicado_por: usuarioId })
    .eq("id", loteId)
    .eq("situacao", "rascunho")
    .select("id")
  if (!travou?.length) return { erro: "Este lote já foi aplicado." }

  const gravados: ItemLote[] = []
  const conflitos: ItemLote[] = []
  const erros: string[] = []
  await emParalelo(agrupar(escolhidos), 8, async (g) => {
    // Só grava se o campo ainda está como na prévia.
    const r = await gravarGrupo(g, (i, atual) => (mesmoValor(i.campo, atual, i.anterior) ? i.novo : undefined))
    gravados.push(...r.gravados)
    conflitos.push(...r.conflitos)
    if (r.erro) erros.push(r.erro)
  })
  await marcarItens(loteId, gravados.map((i) => i.seq), { aplicado: true })

  const porFiliado = new Map<string, string[]>()
  for (const i of gravados.filter((i) => i.acompanha === null)) {
    porFiliado.set(i.filiadoId, [...(porFiliado.get(i.filiadoId) ?? []), ROTULOS_CAMPO[i.campo] ?? i.campo])
  }
  await registrarProntuario(porFiliado, (campos) => `Cadastro atualizado pela lista de trabalhadores "${dados.lote.arquivo}": ${campos}.`, usuarioId)

  const resumo = {
    pessoas: porFiliado.size,
    campos: gravados.filter((i) => i.acompanha === null).length,
    conflitos: conflitos.filter((i) => i.acompanha === null).length,
  }
  await admin.from(LOTE).update({ resumo }).eq("id", loteId)
  invalidarCaches()
  if (erros.length) return { erro: `Parte não foi gravada: ${erros[0]}`, resumo }
  return { resumo }
}

export async function desfazerLote(loteId: string, usuarioId: string): Promise<{ erro?: string; resumo?: Record<string, number> }> {
  const dados = await lerLote(loteId)
  if (!dados) return { erro: "Lote não encontrado." }
  if (dados.lote.situacao !== "aplicado") return { erro: "Só um lote aplicado pode ser desfeito." }
  const admin = await createAdminClient()
  const { data: travou } = await admin
    .from(LOTE)
    .update({ situacao: "desfeito", desfeito_em: new Date().toISOString(), desfeito_por: usuarioId })
    .eq("id", loteId)
    .eq("situacao", "aplicado")
    .select("id")
  if (!travou?.length) return { erro: "Este lote já foi desfeito." }

  const aplicados = dados.itens.filter((i) => i.aplicado && !i.desfeito)
  const devolvidos: ItemLote[] = []
  const conflitos: ItemLote[] = []
  const erros: string[] = []
  await emParalelo(agrupar(aplicados), 8, async (g) => {
    // Campo mexido depois do lote fica como está.
    const r = await gravarGrupo(g, (i, atual) => (mesmoValor(i.campo, atual, i.novo) ? i.anterior : undefined))
    devolvidos.push(...r.gravados)
    conflitos.push(...r.conflitos)
    if (r.erro) erros.push(r.erro)
  })
  await marcarItens(loteId, devolvidos.map((i) => i.seq), { desfeito: true })

  const porFiliado = new Map<string, string[]>()
  for (const i of devolvidos.filter((i) => i.acompanha === null)) {
    porFiliado.set(i.filiadoId, [...(porFiliado.get(i.filiadoId) ?? []), ROTULOS_CAMPO[i.campo] ?? i.campo])
  }
  await registrarProntuario(porFiliado, (campos) => `Desfeita a atualização pela lista de trabalhadores "${dados.lote.arquivo}": ${campos} voltaram ao valor anterior.`, usuarioId)

  const resumo = {
    ...(dados.lote.resumo ?? {}),
    desfeitosPessoas: porFiliado.size,
    desfeitosCampos: devolvidos.filter((i) => i.acompanha === null).length,
    mantidosPorMudanca: conflitos.filter((i) => i.acompanha === null).length,
  }
  await admin.from(LOTE).update({ resumo }).eq("id", loteId)
  invalidarCaches()
  if (erros.length) return { erro: `Parte não foi desfeita: ${erros[0]}`, resumo }
  return { resumo }
}

/** Lote em rascunho que ninguém quis aplicar. */
export async function descartarRascunho(loteId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from(LOTE)
    .delete()
    .eq("id", loteId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "rascunho")
  return error ? { erro: error.message } : {}
}

// ── 4. Cadastrar os não encontrados ──────────────────────────────────────────

export const MAX_CADASTRO_LISTA = 500

export async function cadastrarNaoEncontrados(
  loteId: string,
  linhas: number[],
  condicao: string,
  usuarioId: string
): Promise<{ erro?: string; criados?: number; reaproveitados?: number; erros?: string[] }> {
  if (!(FILIACAO_CONDICOES as readonly string[]).includes(condicao)) return { erro: "Condição inválida." }
  const dados = await lerLote(loteId)
  if (!dados) return { erro: "Lote não encontrado." }
  if (dados.lote.situacao === "desfeito") return { erro: "Este lote foi desfeito." }
  const fonteId = dados.lote.fonteId
  if (!fonteId) return { erro: "Para cadastrar, a lista precisa ter sido enviada com a fonte pagadora." }
  const fonte = await buscarFontePagadora(fonteId)
  if (!fonte) return { erro: "Fonte pagadora não encontrada." }

  const alvo = new Set(linhas)
  const pendentes = dados.lote.naoEncontrados.filter((n) => alvo.has(n.linha) && !n.cadastradoId)
  if (!pendentes.length) return { erro: "Nenhuma linha marcada." }
  if (pendentes.length > MAX_CADASTRO_LISTA) return { erro: `No máximo ${MAX_CADASTRO_LISTA} por vez.` }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const agora = new Date().toISOString()
  const condicaoNaFonte = condicaoNaFontePadrao(fonte.fundo_pensao === true)
  const erros: string[] = []
  let criados = 0
  let reaproveitados = 0

  for (const n of pendentes) {
    const nome = n.nome ?? n.cadastro.nome_completo ?? null
    if (!nome || nome.length < 3) {
      erros.push(`Linha ${n.linha}: sem nome.`)
      continue
    }
    let filiadoId: string | null = null
    if (n.cpf) {
      // Alguém pode ter cadastrado a pessoa depois da prévia.
      const { data: existe } = await admin
        .from("filiacoes")
        .select("id")
        .eq("emp_proprietaria_id", emp)
        .in("cpf", grafiasDoCpf(n.cpf))
        .not("filiacao_excluida", "is", true)
        .limit(1)
      if (existe?.length) {
        filiadoId = String(existe[0].id)
        reaproveitados++
      }
    }
    if (!filiadoId) {
      const cadastro: Record<string, unknown> = { ...n.cadastro }
      for (const c of ["telefone_1", "telefone_2", "endereco_cep"]) if (cadastro[c]) cadastro[c] = String(cadastro[c]).replace(/\D/g, "")
      const { data: criado, error } = await admin
        .from("filiacoes")
        .insert({
          ...cadastro,
          nome_completo: nome,
          cpf: n.cpf ? cpfConfiavel(n.cpf) : null,
          filiacao_condicao: condicao,
          condicao_desde: agora,
          ...(condicao === "Ativo" ? { ativo_em: agora } : {}),
          emp_proprietaria_id: emp,
        })
        .select("id")
        .single()
      if (error || !criado) {
        erros.push(`${nome}: ${error?.message ?? "não foi possível cadastrar"}`)
        continue
      }
      filiadoId = String(criado.id)
      await atribuirMatriculaSindical(filiadoId)
      criados++
    }

    const { data: aberto } = await admin
      .from("filiacao_vinculos")
      .select("id")
      .eq("filiado_id", filiadoId)
      .eq("fonte_pagadora_id", fonteId)
      .is("data_desfiliacao", null)
      .is("filiacao_data_saida", null)
      .limit(1)
    if (!aberto?.length) {
      const v = n.vinculo
      const { error } = await admin.from("filiacao_vinculos").insert({
        filiado_id: filiadoId,
        fonte_pagadora_id: fonteId,
        matricula: v.matricula ?? n.matricula,
        cargo: v.cargo ?? null,
        lotacao: v.lotacao ?? null,
        data_entrada_admissao: v.data_entrada_admissao ?? null,
        data_saida_demissao: v.data_saida_demissao ?? null,
        regime_trabalho: v.regime_trabalho ?? null,
        condicao_na_fonte: v.condicao_na_fonte ?? condicaoNaFonte,
        fonte_pg_matricula: v.matricula ?? n.matricula,
        fonte_pg_cargo: v.cargo ?? null,
        fonte_pg_lotacao: v.lotacao ?? null,
        fonte_pg_admissao: v.data_entrada_admissao ?? null,
        emp_proprietaria_id: emp,
      })
      if (error) erros.push(`${nome}: cadastrado, mas o vínculo falhou (${error.message}).`)
    }
    await admin.from("filiacao_prontuario").insert({
      filiacao_id: filiadoId,
      data: agora,
      tipo: "Atualização cadastral",
      descricao: `Cadastrado a partir da lista de trabalhadores "${dados.lote.arquivo}" (condição ${condicao}).`,
      diretor_funcionario_id: usuarioId,
      emp_proprietaria_id: emp,
      created_at: agora,
      modified_at: agora,
    })
    n.cadastradoId = filiadoId
  }

  await admin.from(LOTE).update({ nao_encontrados: dados.lote.naoEncontrados }).eq("id", loteId)
  invalidarCaches()
  return { criados, reaproveitados, erros }
}
