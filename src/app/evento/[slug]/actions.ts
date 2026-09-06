"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { type EstadoForm } from "@/lib/contas"
import { enviarEmail } from "@/lib/email"
import { carregarEventoPublico } from "@/lib/db/eventos-publico"
import {
  criarInscricao,
  limparCpf,
  validarCpf,
  validarEmail,
} from "@/lib/db/eventos-publico"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Inscrição pública em evento.
 *
 * As travas são revalidadas AQUI, no servidor, mesmo já tendo sido checadas na
 * tela: Server Actions são alcançáveis por POST direto, e entre o carregamento
 * da página e o envio do formulário as vagas podem ter acabado.
 */

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

export async function inscreverAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const slug = txt(fd, "slug")
  if (!slug) return { erro: "Evento inválido." }

  const tenantId = await tenantAtual()
  const publico = await carregarEventoPublico(slug, tenantId)
  if (!publico) return { erro: "Evento não encontrado." }

  if (!publico.aberta) {
    return { erro: publico.motivoFechada ?? "As inscrições estão fechadas." }
  }

  const nome = txt(fd, "nome")
  if (nome.length < 5) return { erro: "Informe seu nome completo." }

  const cpf = limparCpf(txt(fd, "cpf"))
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }

  const email = txt(fd, "email").toLowerCase()
  if (!validarEmail(email)) return { erro: "Informe um e-mail válido." }

  const telefone = txt(fd, "telefone").replace(/\D/g, "")
  if (telefone.length < 10) {
    return { erro: "Informe um telefone com DDD." }
  }

  if (fd.get("aceite") !== "on") {
    return { erro: "É preciso aceitar o tratamento dos dados para se inscrever." }
  }
  // Quando a foto é exigida, o aceite do termo dela também é — e a tela avisa
  // antes que sem a foto não há inscrição.
  if (publico.fotoObrigatoria && fd.get("aceite_foto") !== "on") {
    return {
      erro: "Neste evento a foto é obrigatória. Sem aceitar o termo da foto não é possível concluir a inscrição.",
    }
  }

  // Campos extras: os obrigatórios são cobrados aqui também.
  const respostas: { campoId: string; rotulo: string; valor: string }[] = []
  for (const campo of publico.campos) {
    const valor = txt(fd, `campo_${campo.id}`)
    if (campo.obrigatorio && !valor) {
      return { erro: `Preencha "${campo.rotulo}".` }
    }
    if (valor) {
      respostas.push({ campoId: campo.id, rotulo: campo.rotulo, valor })
    }
  }

  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null

  const { erro, token, codigo } = await criarInscricao(
    publico.evento.id,
    tenantId,
    {
      nome,
      cpf,
      email,
      telefone,
      termoId: publico.termoInscricao?.id ?? null,
      termoFotoId: publico.fotoObrigatoria
        ? (publico.termoFoto?.id ?? null)
        : null,
      respostas,
      ip,
    }
  )
  if (erro || !token) return { erro: erro ?? "Falha ao registrar a inscrição." }

  // `codigo` ausente = inscrição já confirmada antes; segue direto para a
  // página dela sem reenviar nada.
  if (codigo) {
    const link = `${await origemAtual()}/inscricao/${token}`
    const enviado = await enviarEmail({
      email,
      nome,
      assunto: `Confirme sua inscrição — ${publico.evento.titulo ?? "evento"}`,
      html: `<p>Olá, ${nome.split(" ")[0]}!</p><p>Seu código de confirmação é:</p><p style="font-size:28px;letter-spacing:4px;font-weight:bold">${codigo}</p><p>Ele vale por 30 minutos. Informe-o na página da sua inscrição:</p><p><a href="${link}">${link}</a></p><p>Guarde este link: é por ele que você acompanha a inscrição.</p><p>{ENTIDADE}</p>`,
    })
    // Sem e-mail configurado o fluxo não pode travar — o código vai para o log
    // do servidor para a equipe repassar manualmente.
    if (!enviado) console.info(`[eventos] código de ${email}: ${codigo}`)
  }

  redirect(`/inscricao/${token}`)
}
