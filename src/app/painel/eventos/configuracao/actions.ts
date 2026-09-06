"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { type ModoFoto } from "@/lib/db/eventos"
import {
  marcarRemocaoDeAcesso,
  removerCampo,
  reativarCampo,
  salvarCampo,
  salvarConfigEventos,
} from "@/lib/db/eventos-config"

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

function marcado(fd: FormData, campo: string): boolean {
  return fd.get(campo) === "on"
}

export async function salvarConfigAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("eventos_gestao")

  const modoFoto = txt(fd, "modo_foto") as ModoFoto
  if (!["nenhuma", "visual", "biometrica"].includes(modoFoto)) {
    return { erro: "Modo de foto inválido." }
  }

  const dias = Number(txt(fd, "retencao_foto_dias"))
  if (!Number.isFinite(dias) || dias < 1 || dias > 3650) {
    return { erro: "O prazo de guarda da foto deve ficar entre 1 e 3650 dias." }
  }

  const nomeCatraca = txt(fd, "controle_acesso_nome")
  if (modoFoto === "biometrica" && !nomeCatraca) {
    return {
      erro: "Informe o nome do sistema de controle de acesso — ele aparece no termo que a pessoa assina e na pendência de remoção.",
    }
  }
  // Ligar a biometria sem confirmar seria decidir por engano o regime legal de
  // dado sensível para todo o tenant.
  if (modoFoto === "biometrica" && !marcado(fd, "ciente_sensivel")) {
    return {
      erro: "Marque a confirmação de que a entidade assume o tratamento de dado biométrico antes de salvar.",
    }
  }

  const { erro } = await salvarConfigEventos({
    modoFoto,
    retencaoFotoDias: dias,
    controleAcessoNome: nomeCatraca || null,
    controleAcessoExclusaoManual: marcado(fd, "controle_acesso_exclusao_manual"),
    usuarioId: sessao.usuario.id,
  })
  if (erro) return { erro: `Não foi possível salvar: ${erro}` }

  revalidatePath("/painel/eventos/configuracao")
  revalidatePath("/painel/eventos")
  return { ok: "Configuração salva." }
}

// ── Campos extras ────────────────────────────────────────────────────────────

export async function salvarCampoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("eventos_gestao")
  const eventoId = txt(fd, "eventoId")
  if (!eventoId) return { erro: "Evento inválido." }

  const rotulo = txt(fd, "rotulo")
  if (rotulo.length < 2) return { erro: "Dê um nome ao campo." }

  const tipo = txt(fd, "tipo")
  if (!["texto", "numero", "data", "selecao", "sim_nao"].includes(tipo)) {
    return { erro: "Tipo de campo inválido." }
  }

  const opcoes = txt(fd, "opcoes")
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean)
  if (tipo === "selecao" && opcoes.length < 2) {
    return { erro: "Uma escolha entre opções precisa de pelo menos duas." }
  }

  const { erro } = await salvarCampo(eventoId, {
    id: txt(fd, "id") || undefined,
    rotulo,
    tipo,
    opcoes,
    ajuda: txt(fd, "ajuda") || null,
    obrigatorio: marcado(fd, "obrigatorio"),
  })
  if (erro) return { erro: `Não foi possível salvar: ${erro}` }

  revalidatePath(`/painel/eventos/${eventoId}/campos`)
  return { ok: "Campo salvo." }
}

export async function removerCampoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("eventos_gestao")
  const eventoId = txt(fd, "eventoId")
  const campoId = txt(fd, "campoId")
  if (!campoId) return { erro: "Campo inválido." }

  const res = await removerCampo(campoId)
  if (res.erro) return { erro: `Não foi possível remover: ${res.erro}` }

  revalidatePath(`/painel/eventos/${eventoId}/campos`)
  return {
    ok: res.desativado
      ? "Campo desativado — ele some do formulário, mas as respostas já dadas continuam na ficha de quem se inscreveu."
      : "Campo removido.",
  }
}

export async function reativarCampoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("eventos_gestao")
  const eventoId = txt(fd, "eventoId")
  const { erro } = await reativarCampo(txt(fd, "campoId"))
  if (erro) return { erro: `Não foi possível reativar: ${erro}` }

  revalidatePath(`/painel/eventos/${eventoId}/campos`)
  return { ok: "Campo reativado." }
}

// ── LGPD ─────────────────────────────────────────────────────────────────────

export async function marcarRemocaoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("eventos_gestao")
  const id = txt(fd, "pedidoId")
  if (!id) return { erro: "Pedido inválido." }

  const { erro } = await marcarRemocaoDeAcesso(id, sessao.usuario.id)
  if (erro) return { erro: `Não foi possível baixar a pendência: ${erro}` }

  revalidatePath("/painel/eventos/lgpd")
  return { ok: "Remoção registrada." }
}
