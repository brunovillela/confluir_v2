"use server"

import { revalidatePath } from "next/cache"

import { flagsDaModalidade, MODALIDADES } from "@/lib/assembleias-constantes"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { decodificarCsv, normalizarCabecalho, parseCsv } from "@/lib/csv"
import {
  atualizarAssembleia,
  atualizarApto,
  atualizarPergunta,
  atualizarRodada,
  cadastrarApto,
  criarAssembleia,
  criarOpcao,
  criarPergunta,
  excluirAssembleia,
  excluirOpcao,
  excluirPergunta,
  importarAptos,
  obterRodada,
  removerApto,
  subirArquivoAssembleias,
  validarEdicaoAssembleias,
  validarEdicaoPerguntas,
  type ResultadoImportacaoAptos,
} from "@/lib/db/assembleias"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function revalidarRodada(rodadaId: string) {
  revalidatePath(`/painel/representacao/assembleias/rodadas/${rodadaId}`)
}

// ── Dados da rodada ────────────────────────────────────────────────────────

export async function salvarRodada(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const id = texto(formData, "rodada_id")
  if (!id) return { erro: "Rodada inválida." }
  const nome = texto(formData, "nome")
  if (!nome) return { erro: "Informe o nome da rodada." }

  const dados: Parameters<typeof atualizarRodada>[1] = {
    nome,
    descricao: texto(formData, "descricao") || null,
    inicio: dataISO(texto(formData, "inicio")),
    termino: dataISO(texto(formData, "termino")),
    video_indicativo_url: texto(formData, "video_indicativo_url") || null,
    apuracao_encerrada: texto(formData, "apuracao_encerrada") === "on",
  }

  const edital = formData.get("edital")
  if (edital instanceof File && edital.size > 0) {
    const { caminho, erro } = await subirArquivoAssembleias(
      `rodadas/${id}/edital`,
      edital
    )
    if (erro) return { erro }
    dados.edital_url = caminho
  }
  const card = formData.get("card_grafico")
  if (card instanceof File && card.size > 0) {
    const { caminho, erro } = await subirArquivoAssembleias(
      `rodadas/${id}/card`,
      card
    )
    if (erro) return { erro }
    dados.card_grafico_url = caminho
  }

  const { erro } = await atualizarRodada(id, dados)
  if (erro) return { erro }
  revalidarRodada(id)
  return { ok: "Rodada salva." }
}

// ── Perguntas e opções ─────────────────────────────────────────────────────

export async function novaPergunta(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const rodadaId = texto(formData, "rodada_id")
  if (!rodadaId) return { erro: "Rodada inválida." }
  const bloqueio = await validarEdicaoPerguntas(rodadaId)
  if (bloqueio) return { erro: bloqueio }
  const pergunta = texto(formData, "pergunta")
  if (!pergunta) return { erro: "Escreva a pergunta." }
  const ordemBruta = texto(formData, "ordem")
  const ordem = /^\d+$/.test(ordemBruta) ? Number(ordemBruta) : null
  const opcoes = texto(formData, "opcoes")
    .split("\n")
    .map((o) => o.trim())
    .filter((o) => o.length > 0)

  const { erro } = await criarPergunta({
    rod_assembleia_id: rodadaId,
    pergunta,
    ordem,
    opcoes,
  })
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Pergunta criada." }
}

export async function salvarPergunta(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const id = texto(formData, "pergunta_id")
  const rodadaId = texto(formData, "rodada_id")
  const pergunta = texto(formData, "pergunta")
  if (!id || !rodadaId) return { erro: "Pergunta inválida." }
  const bloqueio = await validarEdicaoPerguntas(rodadaId)
  if (bloqueio) return { erro: bloqueio }
  if (!pergunta) return { erro: "Escreva a pergunta." }
  const ordemBruta = texto(formData, "ordem")
  const ordem = /^\d+$/.test(ordemBruta) ? Number(ordemBruta) : null

  const { erro } = await atualizarPergunta(id, { pergunta, ordem })
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Pergunta salva." }
}

export async function removerPergunta(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const id = texto(formData, "pergunta_id")
  const rodadaId = texto(formData, "rodada_id")
  if (!id || !rodadaId) return { erro: "Pergunta inválida." }
  const bloqueio = await validarEdicaoPerguntas(rodadaId)
  if (bloqueio) return { erro: bloqueio }

  const { erro } = await excluirPergunta(id)
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Pergunta excluída." }
}

export async function novaOpcao(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const perguntaId = texto(formData, "pergunta_id")
  const rodadaId = texto(formData, "rodada_id")
  const opcao = texto(formData, "opcao_resposta")
  if (!perguntaId || !rodadaId) return { erro: "Pergunta inválida." }
  const bloqueio = await validarEdicaoPerguntas(rodadaId)
  if (bloqueio) return { erro: bloqueio }
  if (!opcao) return { erro: "Escreva o texto da opção." }

  const { erro } = await criarOpcao({
    pergunta_id: perguntaId,
    opcao_resposta: opcao,
  })
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Opção adicionada." }
}

export async function removerOpcao(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const id = texto(formData, "opcao_id")
  const rodadaId = texto(formData, "rodada_id")
  if (!id || !rodadaId) return { erro: "Opção inválida." }
  const bloqueio = await validarEdicaoPerguntas(rodadaId)
  if (bloqueio) return { erro: bloqueio }

  const { erro } = await excluirOpcao(id)
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Opção excluída." }
}

// ── Assembleias da rodada ──────────────────────────────────────────────────

function dadosAssembleia(formData: FormData): {
  dados?: {
    nome: string
    descricao: string | null
    online: boolean
    urnas_de_votacao: boolean
    voto_em_separado: boolean
    data_inicio: string | null
    data_termino: string | null
  }
  erro?: string
} {
  const nome = texto(formData, "nome")
  if (!nome) return { erro: "Informe o nome da assembleia." }
  const modalidadeBruta = texto(formData, "modalidade")
  const modalidade = (MODALIDADES as readonly string[]).includes(
    modalidadeBruta
  )
    ? (modalidadeBruta as (typeof MODALIDADES)[number])
    : null
  if (!modalidade) return { erro: "Escolha a modalidade da assembleia." }

  return {
    dados: {
      nome,
      descricao: texto(formData, "descricao") || null,
      ...flagsDaModalidade(modalidade),
      voto_em_separado: texto(formData, "voto_em_separado") === "on",
      data_inicio: dataISO(texto(formData, "data_inicio")),
      data_termino: dataISO(texto(formData, "data_termino")),
    },
  }
}

export async function novaAssembleia(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const rodadaId = texto(formData, "rodada_id")
  if (!rodadaId) return { erro: "Rodada inválida." }
  const rodada = await obterRodada(rodadaId)
  if (!rodada) return { erro: "Rodada não encontrada." }
  const bloqueio = await validarEdicaoAssembleias(rodadaId)
  if (bloqueio) return { erro: bloqueio }

  const { dados, erro: erroDados } = dadosAssembleia(formData)
  if (erroDados || !dados) return { erro: erroDados }

  const { erro } = await criarAssembleia({ rod_assembleia_id: rodadaId, ...dados })
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Assembleia criada." }
}

export async function salvarAssembleia(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const id = texto(formData, "assembleia_id")
  const rodadaId = texto(formData, "rodada_id")
  if (!id || !rodadaId) return { erro: "Assembleia inválida." }
  const bloqueio = await validarEdicaoAssembleias(rodadaId)
  if (bloqueio) return { erro: bloqueio }

  const { dados, erro: erroDados } = dadosAssembleia(formData)
  if (erroDados || !dados) return { erro: erroDados }

  const completos: Parameters<typeof atualizarAssembleia>[1] = { ...dados }
  const edital = formData.get("edital")
  if (edital instanceof File && edital.size > 0) {
    const { caminho, erro } = await subirArquivoAssembleias(
      `assembleias/${id}/edital`,
      edital
    )
    if (erro) return { erro }
    completos.edital = caminho
  }
  const ata = formData.get("ata")
  if (ata instanceof File && ata.size > 0) {
    const { caminho, erro } = await subirArquivoAssembleias(
      `assembleias/${id}/ata`,
      ata
    )
    if (erro) return { erro }
    completos.ata = caminho
  }

  const { erro } = await atualizarAssembleia(id, completos)
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Assembleia salva." }
}

export async function apagarAssembleia(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const id = texto(formData, "assembleia_id")
  const rodadaId = texto(formData, "rodada_id")
  if (!id || !rodadaId) return { erro: "Assembleia inválida." }

  const { erro } = await excluirAssembleia(id)
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Assembleia excluída." }
}

// ── Aptos a votar ──────────────────────────────────────────────────────────

export type EstadoImportacaoAptos = EstadoForm & {
  resultado?: ResultadoImportacaoAptos
}

const MAX_LINHAS = 20_000

const SINONIMOS: Record<string, "cpf" | "nome" | "matricula" | "email"> = {
  cpf: "cpf",
  nome: "nome",
  nomecompleto: "nome",
  matricula: "matricula",
  email: "email",
  emailcorporativo: "email",
}

export async function importarAptosCsv(
  _prev: EstadoImportacaoAptos,
  formData: FormData
): Promise<EstadoImportacaoAptos> {
  await requirePermissao("assembleias")

  const rodadaId = texto(formData, "rodada_id")
  if (!rodadaId) return { erro: "Rodada inválida." }
  const rodada = await obterRodada(rodadaId)
  if (!rodada) return { erro: "Rodada não encontrada." }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo CSV." }
  }

  const linhasCsv = parseCsv(decodificarCsv(await arquivo.arrayBuffer()))
  if (linhasCsv.length < 2) {
    return { erro: "A planilha está vazia (só o cabeçalho ou nada)." }
  }
  if (linhasCsv.length - 1 > MAX_LINHAS) {
    return {
      erro: `A planilha tem ${(linhasCsv.length - 1).toLocaleString("pt-BR")} linhas — o limite por importação é ${MAX_LINHAS.toLocaleString("pt-BR")}.`,
    }
  }

  const colunas = new Map<number, "cpf" | "nome" | "matricula" | "email">()
  linhasCsv[0].forEach((titulo, i) => {
    const campo = SINONIMOS[normalizarCabecalho(titulo)]
    if (campo && ![...colunas.values()].includes(campo)) colunas.set(i, campo)
  })
  if (![...colunas.values()].includes("cpf")) {
    return { erro: "A planilha precisa de uma coluna 'cpf'." }
  }

  const erros: { linha: number; motivo: string }[] = []
  const linhas: {
    linha: number
    cpf: string
    nome_completo: string | null
    matricula: string | null
    email: string | null
  }[] = []
  for (let i = 1; i < linhasCsv.length; i++) {
    const bruta = linhasCsv[i]
    if (bruta.every((c) => c.trim() === "")) continue
    const campos: Partial<Record<"cpf" | "nome" | "matricula" | "email", string>> =
      {}
    for (const [indice, campo] of colunas) {
      campos[campo] = (bruta[indice] ?? "").trim()
    }
    const cpf = limparCpf(campos.cpf ?? "")
    if (!validarCpf(cpf)) {
      erros.push({ linha: i + 1, motivo: `CPF inválido: ${campos.cpf || "(vazio)"}` })
      continue
    }
    linhas.push({
      linha: i + 1,
      cpf,
      nome_completo: campos.nome || null,
      matricula: campos.matricula || null,
      email: campos.email || null,
    })
  }

  const { resultado, erro } = await importarAptos(rodadaId, linhas)
  if (erro || !resultado) return { erro: erro ?? "Falha na importação." }
  resultado.erros = [...erros, ...resultado.erros]
  resultado.totalLinhas += erros.length
  revalidarRodada(rodadaId)
  return { resultado }
}

export async function excluirApto(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const id = texto(formData, "apto_id")
  const rodadaId = texto(formData, "rodada_id")
  if (!id || !rodadaId) return { erro: "Registro inválido." }

  const { erro } = await removerApto(id)
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Apto removido da lista." }
}

/** Lê e valida os campos comuns do formulário de eleitor. */
function dadosEleitor(formData: FormData):
  | {
      cpf: string
      nome_completo: string | null
      matricula: string | null
      email: string | null
    }
  | { erro: string } {
  const cpf = limparCpf(texto(formData, "cpf"))
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  return {
    cpf,
    nome_completo: texto(formData, "nome") || null,
    matricula: texto(formData, "matricula") || null,
    email: texto(formData, "email") || null,
  }
}

export async function cadastrarEleitor(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const rodadaId = texto(formData, "rodada_id")
  if (!rodadaId) return { erro: "Rodada inválida." }
  const dados = dadosEleitor(formData)
  if ("erro" in dados) return { erro: dados.erro }

  const { erro } = await cadastrarApto(rodadaId, dados)
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Eleitor cadastrado." }
}

export async function salvarEleitor(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const id = texto(formData, "apto_id")
  const rodadaId = texto(formData, "rodada_id")
  if (!id || !rodadaId) return { erro: "Eleitor inválido." }
  const dados = dadosEleitor(formData)
  if ("erro" in dados) return { erro: dados.erro }

  const { erro } = await atualizarApto(id, dados)
  if (erro) return { erro }
  revalidarRodada(rodadaId)
  return { ok: "Eleitor atualizado." }
}
