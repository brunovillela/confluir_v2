"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel, type SessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { alcadaDoUsuario } from "@/lib/db/compras"
import { buscarSolicitacaoDiaria, type SolicitacaoDiaria } from "@/lib/db/diarias"
import { complementoAberto, lancarDespesaPosterior, removerDespesaPosterior } from "@/lib/db/diarias-complemento"
import {
  aprovarRemessaDiarias,
  devolverRemessaDiarias,
  enviarRemessaParaAvaliacao,
  obterRemessaNova,
  reenviarRemessaDiarias,
  retirarDiariaDaRemessa,
  type RemessaNova,
} from "@/lib/db/diarias-remessas"
import { geraDiariasDoQuadro, podeAvaliarRemessa } from "@/lib/db/diarias-remessas-avaliador"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Avaliação da REMESSA de diárias (08/10/2026) — as mesmas actions para as
 * duas portas; a permissão sai do quadro da remessa (a regra mora em
 * lib/db/diarias-remessas-avaliador.ts, a mesma do bot do Telegram).
 */

function geraDiarias(sessao: SessaoPainel, remessa: RemessaNova): boolean {
  return geraDiariasDoQuadro(sessao.permissoes, remessa)
}

async function podeAvaliar(sessao: SessaoPainel, remessa: RemessaNova): Promise<boolean> {
  return podeAvaliarRemessa(String(sessao.usuario.id), sessao.permissoes, remessa)
}

function revalidar(remessa: RemessaNova) {
  revalidatePath("/painel")
  revalidatePath("/painel/aprovar")
  revalidatePath("/painel/perfil/diarias")
  revalidatePath("/painel/financeiro/ordens")
  if (remessa.quadro === "diretor") {
    revalidatePath("/painel/institucional/diretoria/diarias")
    revalidatePath("/painel/institucional/diretoria/diarias/remessas")
    revalidatePath(`/painel/institucional/diretoria/diarias/remessas/${remessa.id}`)
  } else {
    revalidatePath("/painel/pessoal/diarias")
    revalidatePath("/painel/pessoal/diarias/remessas")
    revalidatePath(`/painel/pessoal/diarias/remessas/${remessa.id}`)
  }
}

async function carregar(fd: FormData) {
  const id = String(fd.get("remessa_id") ?? "")
  if (!id) return null
  return obterRemessaNova(id)
}

/** Aprovar ou devolver (decisao = aprovar | devolver). */
export async function avaliarRemessaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const dados = await carregar(fd)
  if (!dados) return { erro: "Remessa não encontrada." }
  const { remessa } = dados
  if (!(await podeAvaliar(sessao, remessa))) {
    return { erro: "Você não avalia esta remessa (e ninguém avalia a própria)." }
  }
  const decisao = String(fd.get("decisao") ?? "")
  const observacao = String(fd.get("observacao") ?? "").trim()

  if (decisao === "aprovar") {
    const r = await aprovarRemessaDiarias(remessa.id, String(sessao.usuario.id), {
      aplicarDescontos: fd.get("aplicar_descontos") !== "nao",
      // No modo "alcada" a ordem só nasce autorizada dentro desta alçada.
      alcada: alcadaDoUsuario(sessao.permissoes as Record<string, unknown>),
    })
    if (r.erro) return { erro: r.erro }
    revalidar(remessa)
    return {
      ok: `Remessa aprovada — ordem de pagamento ${r.ordemCodigo ?? ""} gerada ${
        r.ordemAutorizada
          ? "e autorizada: está A pagar no Financeiro."
          : "e enviada à fila de autorização (o valor passa da sua alçada financeira)."
      }${
        r.movidas ? ` ${r.movidas} diária(s) lançada(s) durante a avaliação passaram para a próxima remessa.` : ""
      }`,
    }
  }
  if (decisao === "devolver") {
    if (!observacao) return { erro: "Diga o que não está de acordo para devolver.", campo: "observacao" }
    // Não conformidades por diária: campos pendencia_<id> preenchidos.
    const pendencias: { diariaId: string; observacao: string }[] = []
    for (const [chave, valor] of fd.entries()) {
      if (!chave.startsWith("pendencia_")) continue
      const texto = String(valor).trim()
      if (texto) pendencias.push({ diariaId: chave.slice("pendencia_".length), observacao: texto })
    }
    const r = await devolverRemessaDiarias(remessa.id, String(sessao.usuario.id), observacao, pendencias)
    if (r.erro) return { erro: r.erro }
    revalidar(remessa)
    return { ok: "Remessa devolvida — quem lançou foi avisado do que corrigir." }
  }
  return { erro: "Decisão inválida." }
}

/** Reenvia a remessa devolvida: o beneficiário, quem lançou alguma diária dela ou quem gere as diárias. */
export async function reenviarRemessaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const dados = await carregar(fd)
  if (!dados) return { erro: "Remessa não encontrada." }
  const { remessa, solicitacoes } = dados
  const uid = String(sessao.usuario.id)
  const envolvido =
    remessa.beneficiarioId === uid || solicitacoes.some((s) => s.solicitanteId === uid) || geraDiarias(sessao, remessa)
  if (!envolvido) return { erro: "Só quem lançou as diárias reenvia a remessa." }
  const resposta = String(fd.get("resposta") ?? "").trim() || null
  const r = await reenviarRemessaDiarias(remessa.id, uid, resposta)
  if (r.erro) return { erro: r.erro }
  revalidar(remessa)
  return { ok: "Remessa reenviada para avaliação." }
}

/**
 * Despesa DEPOIS DA VIAGEM (16/10): lança na diária recebida (o formulário
 * manda o id da diária original em solicitacao_id). Pode o beneficiário, quem
 * lançou a diária ou quem gere as diárias daquele quadro.
 */
async function podeMexerNaDiaria(sessao: SessaoPainel, diaria: SolicitacaoDiaria): Promise<boolean> {
  const uid = String(sessao.usuario.id)
  if (diaria.funcionario_id === uid || diaria.solicitanteId === uid) return true
  return diaria.beneficiarioTipo === "diretor"
    ? podeAcessar(sessao.permissoes, "diretoria_diarias", ["configuracoes"])
    : podeAcessar(sessao.permissoes, "pessoal_gestao", ["pessoal_diarias"])
}

function revalidarDiaria(diaria: SolicitacaoDiaria) {
  revalidatePath("/painel/perfil/diarias")
  revalidatePath(`/painel/pessoal/diarias/${diaria.id}`)
  revalidatePath(`/painel/institucional/diretoria/diarias/${diaria.id}`)
  revalidatePath("/painel/pessoal/diarias/remessas")
  revalidatePath("/painel/institucional/diretoria/diarias/remessas")
}

export async function lancarDespesaPosteriorAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const origem = await buscarSolicitacaoDiaria(String(fd.get("solicitacao_id") ?? ""))
  if (!origem) return { erro: "Diária não encontrada." }
  if (!(await podeMexerNaDiaria(sessao, origem))) return { erro: "Você não lança despesas nesta diária." }
  const arquivo = fd.get("comprovante")
  const r = await lancarDespesaPosterior({
    origemId: origem.id,
    usuarioId: String(sessao.usuario.id),
    tipoId: String(fd.get("tipo_id") ?? "").trim() || null,
    descricao: String(fd.get("descricao") ?? "").trim() || null,
    valor: Number(String(fd.get("valor") ?? "").replace(/\./g, "").replace(",", ".")),
    arquivo: arquivo instanceof File ? arquivo : null,
  })
  if (r.erro) return { erro: r.erro }
  revalidarDiaria(origem)
  return { ok: "Despesa lançada — entrou na sua remessa em preparação." }
}

export async function removerDespesaPosteriorAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const origem = await buscarSolicitacaoDiaria(String(fd.get("solicitacao_id") ?? ""))
  if (!origem) return { erro: "Diária não encontrada." }
  if (!(await podeMexerNaDiaria(sessao, origem))) return { erro: "Você não mexe nas despesas desta diária." }
  const aberto = await complementoAberto(origem.id)
  const id = String(fd.get("id") ?? "")
  if (!aberto || !aberto.despesas.some((d) => d.id === id)) {
    return { erro: "Só a despesa ainda não enviada para avaliação pode ser excluída." }
  }
  const r = await removerDespesaPosterior(id)
  if (r.erro) return { erro: r.erro }
  revalidarDiaria(origem)
  return { ok: "Despesa excluída." }
}

/** Envia a remessa em preparação para avaliação — o beneficiário ou quem lançou. */
export async function enviarRemessaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const dados = await carregar(fd)
  if (!dados) return { erro: "Remessa não encontrada." }
  const r = await enviarRemessaParaAvaliacao(dados.remessa.id, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidar(dados.remessa)
  return { ok: "Remessa enviada para avaliação." }
}

/** Retira (cancela) uma diária aguardando da remessa — quem gere as diárias. */
export async function retirarDiariaRemessaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const dados = await carregar(fd)
  if (!dados) return { erro: "Remessa não encontrada." }
  const { remessa, solicitacoes } = dados
  if (!geraDiarias(sessao, remessa)) return { erro: "Só quem gere as diárias retira uma diária da remessa." }
  if (remessa.enviada) return { erro: "Remessa já aprovada." }
  const diariaId = String(fd.get("diaria_id") ?? "")
  if (!solicitacoes.some((s) => s.id === diariaId)) return { erro: "Diária fora desta remessa." }
  const r = await retirarDiariaDaRemessa(diariaId, String(sessao.usuario.id), String(fd.get("motivo") ?? "").trim() || null)
  if (r.erro) return { erro: r.erro }
  revalidar(remessa)
  return { ok: "Diária retirada da remessa." }
}
