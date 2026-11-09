"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { AJUSTES } from "@/lib/congressos/config"
import { CATEGORIAS_PAPEL, DIREITOS_ROTULO, limparCpf, normalizarDireitos, type CategoriaPapel } from "@/lib/congressos/regras"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarParticipante,
  aplicarOrdemDeInscricao,
  atualizarCongresso,
  atualizarParticipante,
  criarCongresso,
  dadosDoFiliado,
  importarNatosDaDiretoria,
  marcarRegimentoAprovado,
  mudarSituacao,
  obterCongresso,
  removerDoPrograma,
  removerPapel,
  removerUnidade,
  salvarConfig,
  salvarEixo,
  salvarGrupo,
  salvarPapel,
  salvarSessao,
  salvarUnidade,
  SITUACOES_CONGRESSO,
  SITUACOES_PARTICIPANTE,
  TIPOS_SESSAO,
  TIPOS_UNIDADE,
  type DadosParticipante,
  type ModoCongresso,
  type SituacaoCongresso,
  type SituacaoParticipante,
  type TipoSessao,
  type TipoUnidade,
} from "@/lib/db/congressos"
import { deCampoDataHora } from "@/lib/formato"

/**
 * Congressos — escrita. Tudo exige `congressos_gestao`.
 */

const BASE = "/painel/representacao/congressos"

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}
function opc(fd: FormData, campo: string): string | null {
  return txt(fd, campo) || null
}
function num(fd: FormData, campo: string): number | null {
  const v = txt(fd, campo)
  if (!v) return null
  const n = Number(v.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

async function gestor() {
  return requirePermissao("congressos_gestao")
}

function revalidar(id: string) {
  revalidatePath(`${BASE}/${id}`)
  revalidatePath(BASE)
}

// ── Congresso ────────────────────────────────────────────────────────────────

export async function criarCongressoAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await gestor()
  const nome = txt(fd, "nome")
  if (nome.length < 3) return { erro: "Informe o nome do congresso.", campo: "nome" }
  const partida = txt(fd, "partida")
  const copiaDe = opc(fd, "copia_de")
  const modeloId = opc(fd, "modelo")
  if (partida === "copia" && !copiaDe) return { erro: "Escolha a edição anterior a copiar.", campo: "copia_de" }
  if (partida !== "copia" && !modeloId) return { erro: "Escolha um modelo.", campo: "modelo" }
  const modo = (txt(fd, "modo") === "participa" ? "participa" : "promove") as ModoCongresso
  const r = await criarCongresso({
    nome,
    edicao: num(fd, "edicao"),
    tema: opc(fd, "tema"),
    modo,
    eventoId: opc(fd, "evento_id"),
    partida: partida === "copia" ? { tipo: "copia", congressoId: copiaDe! } : { tipo: "modelo", modeloId: modeloId! },
    autorId: sessao.usuario.id,
  })
  if (r.erro || !r.id) return { erro: r.erro ?? "Falha ao criar." }
  revalidatePath(BASE)
  redirect(`${BASE}/${r.id}?aba=configuracao`)
}

export async function salvarCongressoAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await gestor()
  const id = txt(fd, "id")
  const nome = txt(fd, "nome")
  if (nome.length < 3) return { erro: "Informe o nome do congresso.", campo: "nome" }
  const situacao = txt(fd, "situacao") as SituacaoCongresso
  if (!SITUACOES_CONGRESSO.some((s) => s.valor === situacao)) return { erro: "Situação inválida." }
  const r = await atualizarCongresso(id, {
    nome,
    edicao: num(fd, "edicao"),
    tema: opc(fd, "tema"),
    modo: txt(fd, "modo") === "participa" ? "participa" : "promove",
    situacao,
    eventoId: opc(fd, "evento_id"),
    etapaAnteriorId: opc(fd, "etapa_anterior_id"),
    etapaSeguinteId: opc(fd, "etapa_seguinte_id"),
    etapaSeguinteNome: opc(fd, "etapa_seguinte_nome"),
  })
  if (r.erro) return { erro: r.erro }
  revalidar(id)
  return { ok: "Dados do congresso salvos." }
}

// ── Configuração ─────────────────────────────────────────────────────────────

export async function salvarConfigAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await gestor()
  const id = txt(fd, "id")
  const c = await obterCongresso(id)
  if (!c) return { erro: "Congresso não encontrado." }
  const brutos: Record<string, unknown> = {}
  const artigos: Record<string, string> = {}
  for (const a of AJUSTES) {
    // Só o que estava na tela (marcador p:) entra; o resto não muda.
    if (!fd.has(`p:${a.chave}`)) continue
    const bruto = fd.get(`v:${a.chave}`)
    if (a.tipo === "booleano") brutos[a.chave] = bruto === "on"
    else if (a.tipo === "datahora") brutos[a.chave] = deCampoDataHora(String(bruto ?? "")) ?? null
    else brutos[a.chave] = bruto === null ? null : String(bruto)
    if (fd.has(`a:${a.chave}`)) artigos[a.chave] = String(fd.get(`a:${a.chave}`) ?? "")
  }
  const r = await salvarConfig(c, brutos, artigos, opc(fd, "motivo"), opc(fd, "deliberacao"), sessao.usuario.id)
  if (r.erro) return { erro: r.erro }
  revalidar(id)
  return { ok: r.ok }
}

export async function regimentoAprovadoAction(fd: FormData): Promise<void> {
  await gestor()
  const id = txt(fd, "id")
  const c = await obterCongresso(id)
  if (!c) return
  await marcarRegimentoAprovado(c, txt(fd, "aprovado") === "sim")
  revalidar(id)
}

// ── Papéis ───────────────────────────────────────────────────────────────────

export async function salvarPapelAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await gestor()
  const congressoId = txt(fd, "congresso_id")
  const nome = txt(fd, "nome")
  if (!nome) return { erro: "Informe o nome do papel.", campo: "nome" }
  const categoria = txt(fd, "categoria") as CategoriaPapel
  if (!CATEGORIAS_PAPEL.some((c) => c.valor === categoria)) return { erro: "Escolha a categoria." }
  const bruto: Record<string, unknown> = {}
  for (const d of DIREITOS_ROTULO) {
    if (d.tipo === "voz") bruto[d.chave] = txt(fd, `d:${d.chave}`)
    else bruto[d.chave] = fd.get(`d:${d.chave}`) === "on"
  }
  // Papel novo nasce com o padrão da categoria; editado, com o que veio da tela.
  const id = opc(fd, "id")
  const direitos = normalizarDireitos(categoria, id ? bruto : {})
  const r = await salvarPapel(congressoId, id, {
    nome,
    categoria,
    cor: opc(fd, "cor"),
    ordem: num(fd, "ordem") ?? 0,
    direitos,
  })
  if (r.erro) return { erro: r.erro }
  revalidar(congressoId)
  return { ok: id ? "Papel salvo." : "Papel criado com os direitos padrão da categoria. Ajuste a matriz se precisar." }
}

export async function removerPapelAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await gestor()
  const congressoId = txt(fd, "congresso_id")
  const r = await removerPapel(congressoId, txt(fd, "id"))
  if (r.erro) return { erro: r.erro }
  revalidar(congressoId)
  return { ok: "Papel removido." }
}

// ── Unidades (bases, entidades, segmentos) ───────────────────────────────────

export async function salvarUnidadeAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await gestor()
  const congressoId = txt(fd, "congresso_id")
  const nome = txt(fd, "nome")
  if (!nome) return { erro: "Informe o nome.", campo: "nome" }
  const tipo = txt(fd, "tipo") as TipoUnidade
  if (!TIPOS_UNIDADE.some((x) => x.valor === tipo)) return { erro: "Escolha o tipo." }
  const limite = num(fd, "limite_delegados")
  const socios = num(fd, "socios")
  if ((limite !== null && limite < 0) || (socios !== null && socios < 0)) return { erro: "Números não podem ser negativos." }
  const r = await salvarUnidade(congressoId, opc(fd, "id"), {
    tipo,
    nome,
    limite_delegados: limite === null ? null : Math.floor(limite),
    socios: socios === null ? null : Math.floor(socios),
    observacao: opc(fd, "observacao"),
    ordem: num(fd, "ordem") ?? 0,
  })
  if (r.erro) return { erro: r.erro }
  revalidar(congressoId)
  return { ok: "Salvo." }
}

export async function removerUnidadeAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await gestor()
  const congressoId = txt(fd, "congresso_id")
  const r = await removerUnidade(congressoId, txt(fd, "id"))
  if (r.erro) return { erro: r.erro }
  revalidar(congressoId)
  return { ok: "Removido." }
}

// ── Programa ─────────────────────────────────────────────────────────────────

export async function salvarEixoAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await gestor()
  const congressoId = txt(fd, "congresso_id")
  const nome = txt(fd, "nome")
  if (!nome) return { erro: "Informe o nome do eixo.", campo: "nome" }
  const r = await salvarEixo(congressoId, opc(fd, "id"), { nome, descricao: opc(fd, "descricao"), ordem: num(fd, "ordem") ?? 0 })
  if (r.erro) return { erro: r.erro }
  revalidar(congressoId)
  return { ok: "Eixo salvo." }
}

export async function salvarGrupoAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await gestor()
  const congressoId = txt(fd, "congresso_id")
  const nome = txt(fd, "nome")
  if (!nome) return { erro: "Informe o nome do grupo.", campo: "nome" }
  const vagas = num(fd, "vagas")
  if (vagas !== null && vagas < 1) return { erro: "As vagas devem ser maiores que zero.", campo: "vagas" }
  const r = await salvarGrupo(congressoId, opc(fd, "id"), {
    nome,
    eixo_id: opc(fd, "eixo_id"),
    sala: opc(fd, "sala"),
    vagas: vagas === null ? null : Math.floor(vagas),
    ordem: num(fd, "ordem") ?? 0,
  })
  if (r.erro) return { erro: r.erro }
  revalidar(congressoId)
  return { ok: "Grupo salvo." }
}

export async function salvarSessaoAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await gestor()
  const congressoId = txt(fd, "congresso_id")
  const titulo = txt(fd, "titulo")
  if (!titulo) return { erro: "Informe o título da sessão.", campo: "titulo" }
  const tipo = txt(fd, "tipo") as TipoSessao
  if (!TIPOS_SESSAO.some((x) => x.valor === tipo)) return { erro: "Escolha o tipo." }
  const r = await salvarSessao(congressoId, opc(fd, "id"), {
    tipo,
    titulo,
    inicio: deCampoDataHora(txt(fd, "inicio")),
    fim: deCampoDataHora(txt(fd, "fim")),
    grupo_id: opc(fd, "grupo_id"),
    eixo_id: opc(fd, "eixo_id"),
    local: opc(fd, "local"),
  })
  if (r.erro) return { erro: r.erro }
  revalidar(congressoId)
  return { ok: "Sessão salva." }
}

export async function removerDoProgramaAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await gestor()
  const congressoId = txt(fd, "congresso_id")
  const tabela = txt(fd, "tabela")
  if (!["congresso_eixos", "congresso_grupos", "congresso_sessoes"].includes(tabela)) return { erro: "Item inválido." }
  const r = await removerDoPrograma(congressoId, tabela as "congresso_eixos", txt(fd, "id"))
  if (r.erro) return { erro: r.erro }
  revalidar(congressoId)
  return { ok: "Removido." }
}

// ── Participantes ────────────────────────────────────────────────────────────

async function lerParticipante(fd: FormData): Promise<DadosParticipante | { erro: string; campo?: string }> {
  const filiacaoId = opc(fd, "filiado_id")
  let nome = txt(fd, "nome")
  let cpfBruto = txt(fd, "cpf")
  let genero = opc(fd, "genero")
  if (filiacaoId && (!nome || !cpfBruto)) {
    const f = await dadosDoFiliado(filiacaoId)
    if (f) {
      nome = nome || f.nome
      cpfBruto = cpfBruto || (f.cpf ?? "")
      genero = genero ?? f.genero
    }
  }
  if (nome.length < 3) return { erro: "Informe o nome ou escolha um filiado.", campo: "nome" }
  const cpf = cpfBruto ? limparCpf(cpfBruto) : null
  if (cpfBruto && !cpf) return { erro: "CPF inválido: precisa ter 11 dígitos.", campo: "cpf" }
  return {
    nome,
    nomeSocial: opc(fd, "nome_social"),
    cpf,
    email: opc(fd, "email"),
    telefone: opc(fd, "telefone"),
    genero,
    filiacaoId,
    papelId: opc(fd, "papel_id"),
    unidadeId: opc(fd, "unidade_id"),
    grupoId: opc(fd, "grupo_id"),
    titularId: opc(fd, "titular_id"),
    acessibilidade: opc(fd, "acessibilidade"),
    observacao: opc(fd, "observacao"),
  }
}

export async function salvarParticipanteAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await gestor()
  const congressoId = txt(fd, "congresso_id")
  const dados = await lerParticipante(fd)
  if ("erro" in dados) return dados
  const id = opc(fd, "id")
  if (id) {
    const r = await atualizarParticipante(congressoId, id, dados, sessao.usuario.id)
    if (r.erro) return { erro: r.erro }
  } else {
    const r = await adicionarParticipante(congressoId, dados, sessao.usuario.id)
    if (r.erro) return { erro: r.erro }
  }
  revalidar(congressoId)
  return { ok: id ? "Participante salvo." : `${dados.nome} incluído(a).` }
}

export async function situacaoParticipanteAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await gestor()
  const congressoId = txt(fd, "congresso_id")
  const situacao = txt(fd, "situacao") as SituacaoParticipante
  if (!SITUACOES_PARTICIPANTE.some((s) => s.valor === situacao)) return { erro: "Situação inválida." }
  const r = await mudarSituacao(congressoId, txt(fd, "id"), situacao, opc(fd, "motivo"), sessao.usuario.id)
  if (r.erro) return { erro: r.erro }
  revalidar(congressoId)
  return { ok: "Situação atualizada." }
}

export async function importarNatosAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await gestor()
  const congressoId = txt(fd, "congresso_id")
  const papelId = txt(fd, "papel_id")
  if (!papelId) return { erro: "Crie um papel de delegado nato antes de importar." }
  const r = await importarNatosDaDiretoria(congressoId, papelId, sessao.usuario.id)
  if (r.erro) return { erro: r.erro }
  revalidar(congressoId)
  return { ok: r.ok }
}

export async function aplicarOrdemAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await gestor()
  const id = txt(fd, "congresso_id")
  const c = await obterCongresso(id)
  if (!c) return { erro: "Congresso não encontrado." }
  const r = await aplicarOrdemDeInscricao(c, sessao.usuario.id)
  if (r.erro) return { erro: r.erro }
  revalidar(id)
  return { ok: r.ok }
}
