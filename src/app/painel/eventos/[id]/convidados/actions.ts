"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { capacidadeDoEvento, obterEvento } from "@/lib/db/eventos"
import {
  conferirNoEvento,
  excluirConvidado,
  gravarConvidados,
} from "@/lib/db/eventos-convidados"
import { validarEmail } from "@/lib/db/eventos-publico"
import {
  lerPlanilha,
  type LinhaConvidado,
  type ProblemaLinha,
} from "@/lib/eventos-planilha"
import { limparCpf, validarCpf } from "@/lib/cpf"

const MAX_PLANILHA = 5 * 1024 * 1024

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

export type EstadoImportacao = EstadoForm & {
  problemas?: ProblemaLinha[]
  /** Quantas linhas boas ficaram de fora por causa dos erros. */
  aguardando?: number
}

/**
 * Importa a planilha de convidados.
 *
 * Confere o arquivo inteiro antes de gravar. Havendo erro, por padrão NÃO
 * grava nada e devolve a lista de problemas com o número da linha — a pessoa
 * corrige a planilha e sobe de novo. Quem preferir aproveitar o que está bom
 * marca "importar as linhas certas mesmo assim".
 */
export async function importarPlanilhaAction(
  _prev: EstadoImportacao,
  fd: FormData
): Promise<EstadoImportacao> {
  const sessao = await requirePermissao("eventos_gestao")
  const eventoId = txt(fd, "eventoId")
  const ignorarErros = fd.get("ignorar_erros") === "on"

  const evento = await obterEvento(eventoId)
  if (!evento) return { erro: "Evento não encontrado." }

  const arquivo = fd.get("planilha")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha a planilha preenchida." }
  }
  if (arquivo.size > MAX_PLANILHA) {
    return { erro: "A planilha deve ter no máximo 5 MB." }
  }

  const leitura = lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()))
  if (leitura.erroGeral) return { erro: leitura.erroGeral }
  if (leitura.lidas === 0) {
    return { erro: "Não encontrei nenhum convidado preenchido na planilha." }
  }

  const { novas, jaInscritos } = await conferirNoEvento(
    eventoId,
    leitura.validas
  )
  const problemas = [...leitura.problemas, ...jaInscritos].sort(
    (a, b) => a.linha - b.linha
  )

  if (problemas.length > 0 && !ignorarErros) {
    return {
      erro: `${problemas.length} de ${leitura.lidas} linha(s) têm problema. Nada foi importado — corrija a planilha e suba de novo, ou marque "importar as linhas certas mesmo assim".`,
      problemas,
      aguardando: novas.length,
    }
  }

  if (novas.length === 0) {
    return {
      erro: "Nenhuma linha nova para importar.",
      problemas,
    }
  }

  // A lotação do local é limite de segurança, não meta: avisa, não bloqueia.
  const capacidade = await capacidadeDoEvento(evento)
  const resultado = await gravarConvidados(
    eventoId,
    sessao.usuario.id,
    novas,
    "planilha"
  )
  if (resultado.erro) {
    return { erro: `Não foi possível gravar: ${resultado.erro}`, problemas }
  }

  const partes = [`${resultado.gravados} convidado(s) importado(s).`]
  if (problemas.length > 0) {
    partes.push(`${problemas.length} linha(s) ficaram de fora.`)
  }
  const total = capacidade.confirmadas + resultado.gravados
  if (capacidade.lotacao !== null && total > capacidade.lotacao) {
    partes.push(
      `Atenção: os confirmados (${total}) passaram da lotação do local (${capacidade.lotacao}).`
    )
  } else if (resultado.gravados > capacidade.cotaRestante) {
    partes.push(
      `A cota de convidados (${capacidade.cotaConvidados}) foi ultrapassada — o excedente saiu das vagas do público.`
    )
  }

  revalidatePath(`/painel/eventos/${eventoId}/convidados`)
  revalidatePath(`/painel/eventos/${eventoId}`)
  return { ok: partes.join(" "), problemas }
}

export async function lancarConvidadoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("eventos_gestao")
  const eventoId = txt(fd, "eventoId")
  const evento = await obterEvento(eventoId)
  if (!evento) return { erro: "Evento não encontrado." }

  const nome = txt(fd, "nome").replace(/\s+/g, " ")
  if (nome.length < 5 || !nome.includes(" ")) {
    return { erro: "Informe o nome completo do convidado." }
  }
  const cpf = limparCpf(txt(fd, "cpf"))
  if (cpf && !validarCpf(cpf)) return { erro: "CPF inválido." }
  const email = txt(fd, "email").toLowerCase()
  if (email && !validarEmail(email)) return { erro: "E-mail inválido." }

  const linha: LinhaConvidado = {
    linha: 0,
    nome,
    cpf,
    email,
    telefone: txt(fd, "telefone").replace(/\D/g, ""),
    convidadoPor: txt(fd, "convidado_por"),
  }

  if (cpf) {
    const { novas } = await conferirNoEvento(eventoId, [linha])
    if (novas.length === 0) {
      return { erro: "Esta pessoa já está inscrita neste evento." }
    }
  }

  const resultado = await gravarConvidados(
    eventoId,
    sessao.usuario.id,
    [linha],
    "painel"
  )
  if (resultado.erro) {
    return { erro: `Não foi possível gravar: ${resultado.erro}` }
  }

  revalidatePath(`/painel/eventos/${eventoId}/convidados`)
  revalidatePath(`/painel/eventos/${eventoId}`)
  return {
    ok: cpf
      ? `${nome} entrou na lista.`
      : `${nome} entrou na lista. Sem CPF não dá para conferir se ele já estava inscrito nem para achá-lo por documento na porta.`,
  }
}

export async function excluirConvidadoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("eventos_gestao")
  const eventoId = txt(fd, "eventoId")
  const inscricaoId = txt(fd, "inscricaoId")
  if (!eventoId || !inscricaoId) return { erro: "Convidado não informado." }

  const { erro } = await excluirConvidado(eventoId, inscricaoId)
  if (erro) return { erro }

  revalidatePath(`/painel/eventos/${eventoId}/convidados`)
  revalidatePath(`/painel/eventos/${eventoId}`)
  return { ok: "Convidado removido." }
}
