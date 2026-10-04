import "server-only"

import { randomUUID } from "node:crypto"

import type { SessaoPainel } from "@/lib/auth"
import { avisarQuemPode, depoisDaResposta } from "@/lib/db/avisos"
import { criarDemanda } from "@/lib/db/nucleo"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * CANAL DE FEEDBACK (onda 2, U12): "Relatar problema / sugerir" no menu de
 * ajuda abre uma DEMANDA (Ferramentas → Demandas) com o relato, a tela de
 * onde veio, quem mandou, o navegador e o print, e avisa quem cuida das
 * demandas. Assim o retorno de quem usa cai na mesma esteira do trabalho da
 * equipe, sem outro lugar para olhar.
 */

export type TipoFeedback = "problema" | "sugestao"

const BUCKET = "documentos"
const TIPOS_IMAGEM: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}

export async function registrarFeedback(
  sessao: SessaoPainel,
  dados: { tipo: TipoFeedback; texto: string; url: string; navegador: string; print: File | null; origem: string }
): Promise<{ id?: string; erro?: string }> {
  const texto = dados.texto.trim()
  if (texto.length < 10) return { erro: "Conte um pouco mais: o que aconteceu, ou qual é a ideia.", }

  let caminhoPrint: string | null = null
  if (dados.print && dados.print.size > 0) {
    const ext = TIPOS_IMAGEM[dados.print.type]
    if (!ext) return { erro: "O print precisa ser uma imagem (PNG, JPG, WebP ou GIF)." }
    if (dados.print.size > 8 * 1024 * 1024) return { erro: "O print deve ter no máximo 8 MB." }
    const admin = await createAdminClient()
    caminhoPrint = `feedback/${randomUUID()}.${ext}`
    const { error } = await admin.storage.from(BUCKET).upload(caminhoPrint, dados.print, { contentType: dados.print.type })
    if (error) return { erro: `Não foi possível guardar o print: ${error.message}` }
  }

  const rotulo = dados.tipo === "problema" ? "Problema" : "Sugestão"
  const nome = String(sessao.usuario.nome_completo ?? sessao.usuario.email ?? "usuário")
  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date())
  const descricao = [
    texto,
    "",
    `— ${rotulo} enviado pelo menu de ajuda por ${nome}${sessao.usuario.email ? ` (${sessao.usuario.email})` : ""} em ${quando}.`,
    `Tela: ${dados.url}`,
    `Navegador: ${dados.navegador}`,
    caminhoPrint ? `Print: ${dados.origem}/painel/ferramentas/demandas/print/${caminhoPrint}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n")

  const titulo = `[${rotulo}] ${texto.replace(/\s+/g, " ").slice(0, 70)}${texto.length > 70 ? "…" : ""}`
  const { id, erro } = await criarDemanda(
    { nome: titulo, descricao, situacao: "A fazer", prazo: null, orcamento: null, membro_responsavel_id: null, tipo: "Feedback do sistema" },
    sessao.usuario.id
  )
  if (erro || !id) return { erro: erro ?? "Não foi possível registrar." }

  depoisDaResposta(() =>
    avisarQuemPode("ferramentas_demandas", ["ferramentas_tarefas"], {
      texto: `${nome} enviou ${dados.tipo === "problema" ? "um relato de problema" : "uma sugestão"} sobre o sistema: ${titulo}`,
      link: `/painel/ferramentas/demandas/${id}`,
      evento: "feedback_sistema",
      assunto: `${rotulo} relatado no Confluir`,
      exceto: sessao.usuario.id,
    })
  )
  return { id }
}
