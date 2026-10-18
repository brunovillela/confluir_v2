"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPortal } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { bloqueioDaParte, opcoesDaParte } from "@/lib/db/portal-partes"
import { ROTULO_CANAL } from "@/lib/db/voto-comprovante"
import {
  confirmarVerificacaoEmail,
  definirEmailVotacaoDireto,
  registrarVotoFiliado,
  solicitarVerificacaoEmail,
} from "@/lib/db/votacao-portal"

import type { EstadoVoto } from "./comprovante-voto"
import {
  descartarCodigoNaoEnviado,
  recusaDeEnvioDeCodigo,
  registrarEnvioDeCodigo,
  type EstadoEnvioCodigo,
} from "./limite-envio-codigo"

/**
 * A trava do e-mail de votação (Filiados › Área do associado): a Votação
 * suspensa ou desabilitada, o portal em modo de consulta, ou a opção de
 * cadastrar o e-mail desligada. O e-mail já verificado continua valendo para
 * achar as votações (assembleiasDoFiliado não muda): desligar a opção fecha a
 * porta do cadastro, não desfaz o que já foi confirmado.
 */
async function bloqueioDoEmailDeVotacao(): Promise<string | null> {
  const bloqueio = await bloqueioDaParte("votacao")
  if (bloqueio) return bloqueio
  const { email_votacao } = await opcoesDaParte("votacao")
  return email_votacao ? null : "O cadastro do e-mail de votação não está disponível no portal."
}

/** Envia o código de verificação para o e-mail de votação informado. */
export async function enviarCodigoEmailVotacao(
  _prev: EstadoEnvioCodigo,
  formData: FormData
): Promise<EstadoEnvioCodigo> {
  const { filiado } = await requireSessaoPortal()
  const bloqueio = await bloqueioDoEmailDeVotacao()
  if (bloqueio) return { erro: bloqueio }
  const email = String(formData.get("email") ?? "").trim()
  if (!email) return { erro: "Informe o e-mail." }

  // Se for exatamente o e-mail com que entra no portal, já vale (verificado).
  if (filiado.email && email.toLowerCase() === filiado.email.toLowerCase()) {
    await definirEmailVotacaoDireto(filiado.cpf, email)
    revalidatePath("/portal/votacao")
    return { ok: "E-mail definido e verificado." }
  }

  // Limite de envio (A142): intervalo entre códigos e teto por filiado e por
  // endereço — sem ele, dava para disparar e-mails sem fim para qualquer um.
  const recusa = await recusaDeEnvioDeCodigo(filiado.cpf, email)
  if (recusa) return { erro: recusa, campo: "email", email }

  const r = await solicitarVerificacaoEmail(filiado.cpf, email)
  if (r.erro) {
    // Código gravado e e-mail não enviado: a pendência sai, para o intervalo
    // não dizer "acabamos de enviar" nem a tela pedir um código que não veio.
    await descartarCodigoNaoEnviado(filiado.cpf, email)
    revalidatePath("/portal/votacao")
    return { erro: r.erro, campo: "email", email }
  }
  await registrarEnvioDeCodigo(filiado.cpf, email)
  revalidatePath("/portal/votacao")
  return { ok: r.ok }
}

/** Confirma o código do e-mail e verifica o e-mail de votação. */
export async function confirmarCodigoEmailVotacao(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const bloqueio = await bloqueioDoEmailDeVotacao()
  if (bloqueio) return { erro: bloqueio }
  const codigo = String(formData.get("codigo") ?? "").trim()
  const r = await confirmarVerificacaoEmail(filiado.cpf, codigo)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/votacao")
  return { ok: "E-mail de votação verificado." }
}

/**
 * Registra o voto do filiado (secreto). Uma escolha por pergunta. Devolve o
 * comprovante para a tela mostrar na hora (A46) — nunca o conteúdo do voto.
 *
 * A trava da Votação suspensa (e do portal em modo de consulta) fica AQUI, e
 * não em registrarVotoFiliado: o /votar público usa a mesma função e não
 * depende do estado do portal.
 */
export async function votarNaAssembleia(
  _prev: EstadoVoto,
  formData: FormData
): Promise<EstadoVoto> {
  const { filiado } = await requireSessaoPortal()
  const bloqueio = await bloqueioDaParte("votacao")
  if (bloqueio) return { erro: bloqueio }
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  if (!assembleiaId) return { erro: "Assembleia inválida." }

  // As escolhas chegam como pares p_<perguntaId> = <opcaoId>.
  const escolhas: { perguntaId: string; opcaoId: string }[] = []
  for (const [chave, valor] of formData.entries()) {
    if (chave.startsWith("p_") && typeof valor === "string" && valor) {
      escolhas.push({ perguntaId: chave.slice(2), opcaoId: valor })
    }
  }
  const r = await registrarVotoFiliado(filiado.cpf, assembleiaId, escolhas)
  if (r.erro) return { erro: r.erro }
  // A revalidação também refaz a página da cédula: é o ramo "já votou" dela,
  // lendo a participação do banco, que mostra o comprovante no portal.
  revalidatePath("/portal/votacao")
  revalidatePath("/portal/inicio")
  const c = r.comprovante
  return {
    ok: "Voto registrado. Obrigado por participar.",
    comprovante: c
      ? {
          codigo: c.codigo,
          quando: c.quando,
          canal: ROTULO_CANAL[c.canal],
          emailEnviado: Boolean(c.emailPara),
          emailPara: c.emailPara,
        }
      : null,
  }
}
