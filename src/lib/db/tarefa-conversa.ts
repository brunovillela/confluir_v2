import "server-only"

import { randomUUID } from "node:crypto"

import { esquemaAusente, lerEmLotesPorIds, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { mencionadoNaTarefa } from "@/lib/db/seguidores"
import { podeAcessar, type Permissoes } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * CONVERSA DA TAREFA (19/11/2026): mensagens com anexo opcional, em
 * `demandas_tarefa_comentarios`; o anexo fica no bucket `documentos`
 * (tarefas/<tarefa>/<arquivo>) e é servido por URL assinada de 1 hora.
 *
 * Quem vê e escreve: quem cuida de Tarefas ou Demandas; o responsável e quem
 * pediu a tarefa; quem vê Projetos, nas tarefas de projeto; quem tem
 * Anomalias, nas providências de anomalia; e quem foi mencionado nela: a
 * menção (@Fulano) abre a conversa daquela tarefa à pessoa (Onda 4).
 */

const BUCKET = "documentos"
/** Teto do anexo: a ação do servidor aceita até 4 MB por envio (next.config). */
export const ANEXO_MAX_BYTES = 3 * 1024 * 1024
const TIPOS_ANEXO = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
])

export type TarefaDaConversa = {
  id: string
  titulo: string | null
  responsavelId: string | null
  demandanteId: string | null
}

export type MensagemTarefa = {
  id: string
  autorId: string | null
  autorNome: string
  texto: string
  anexoNome: string | null
  anexoUrl: string | null
  criadoEm: string
}

/** A tarefa, se a pessoa pode ver a conversa dela; senão null. */
export async function tarefaDaConversa(
  tarefaId: string,
  pessoa: { id: string; permissoes: Permissoes }
): Promise<TarefaDaConversa | null> {
  const admin = await createAdminClient()
  const { data: t } = await admin
    .from("demandas_check_tarefas")
    .select("id, titulo, demandado_id, demandante_id, projeto_id, anomalia_id")
    .eq("id", tarefaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!t) return null
  const p = pessoa.permissoes
  const pode =
    podeAcessar(p, "ferramentas_tarefas", ["ferramentas_demandas"]) ||
    t.demandado_id === pessoa.id ||
    t.demandante_id === pessoa.id ||
    (Boolean(t.projeto_id) && podeAcessar(p, "ferramentas_projetos", ["ferramentas_projetos_edicao"])) ||
    (Boolean(t.anomalia_id) && podeAcessar(p, "ferramentas_anomalias")) ||
    (await mencionadoNaTarefa(String(t.id), pessoa.id))
  if (!pode) return null
  return {
    id: String(t.id),
    titulo: texto(t.titulo),
    responsavelId: texto(t.demandado_id),
    demandanteId: texto(t.demandante_id),
  }
}

export async function listarConversa(tarefaId: string): Promise<MensagemTarefa[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_tarefa_comentarios")
    .select("id, autor_id, texto, anexo_caminho, anexo_nome, created_at")
    .eq("tarefa_id", tarefaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at")
    .limit(500)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler a conversa: ${error.message}`)
  }
  const linhas = data ?? []
  const nomes = await nomesDosUsuarios(linhas.map((l) => String(l.autor_id ?? "")).filter(Boolean), "guerra")
  return Promise.all(
    linhas.map(async (l) => {
      const caminho = texto(l.anexo_caminho)
      let anexoUrl: string | null = null
      if (caminho) {
        const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 3600, {
          download: texto(l.anexo_nome) ?? true,
        })
        anexoUrl = s?.signedUrl ?? null
      }
      return {
        id: String(l.id),
        autorId: texto(l.autor_id),
        autorNome: l.autor_id ? (nomes.get(String(l.autor_id)) ?? "Alguém") : "Alguém que saiu do sistema",
        texto: String(l.texto ?? ""),
        anexoNome: texto(l.anexo_nome),
        anexoUrl,
        criadoEm: String(l.created_at),
      }
    })
  )
}

/** Grava a mensagem (e sobe o anexo, se houver). */
export async function registrarMensagem(
  tarefaId: string,
  autorId: string,
  dados: { texto: string; arquivo: File | null }
): Promise<{ erro?: string }> {
  const arquivo = dados.arquivo && dados.arquivo.size > 0 ? dados.arquivo : null
  if (!dados.texto && !arquivo) return { erro: "Escreva a mensagem ou anexe um arquivo." }
  if (arquivo && arquivo.size > ANEXO_MAX_BYTES) return { erro: "O anexo passa de 3 MB." }
  if (arquivo && !TIPOS_ANEXO.has(arquivo.type)) {
    return { erro: "Anexe PDF, imagem (JPG, PNG, WebP), Word, Excel, CSV ou texto." }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let caminho: string | null = null
  if (arquivo) {
    const extensao = (arquivo.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin"
    caminho = `tarefas/${tarefaId}/${randomUUID()}.${extensao}`
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(caminho, Buffer.from(await arquivo.arrayBuffer()), { contentType: arquivo.type })
    if (error) return { erro: `Não foi possível subir o anexo: ${error.message}` }
  }
  const { error } = await admin.from("demandas_tarefa_comentarios").insert({
    emp_proprietaria_id: emp,
    tarefa_id: tarefaId,
    autor_id: autorId,
    texto: dados.texto,
    anexo_caminho: caminho,
    anexo_nome: arquivo ? arquivo.name.slice(0, 200) : null,
  })
  if (error) {
    if (caminho) await admin.storage.from(BUCKET).remove([caminho])
    return { erro: `Não foi possível gravar a mensagem: ${error.message}` }
  }
  return {}
}

/** Quantas mensagens cada tarefa tem (o número no botão da conversa). */
export async function contarMensagens(tarefaIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (tarefaIds.length === 0) return mapa
  const admin = await createAdminClient()
  try {
    const linhas = await lerEmLotesPorIds(tarefaIds, (fatia, de, ate) =>
      admin.from("demandas_tarefa_comentarios").select("id, tarefa_id").in("tarefa_id", fatia).order("id").range(de, ate)
    )
    for (const l of linhas) mapa.set(String(l.tarefa_id), (mapa.get(String(l.tarefa_id)) ?? 0) + 1)
  } catch (e) {
    if (!esquemaAusente(e as { code?: string })) throw e
  }
  return mapa
}

/** Os anexos da tarefa saem do bucket junto com ela (excluir tarefa). */
export async function removerAnexosDaTarefa(tarefaId: string): Promise<void> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("demandas_tarefa_comentarios")
    .select("anexo_caminho")
    .eq("tarefa_id", tarefaId)
    .not("anexo_caminho", "is", null)
  const caminhos = (data ?? []).map((l) => String(l.anexo_caminho)).filter(Boolean)
  if (caminhos.length) await admin.storage.from(BUCKET).remove(caminhos)
}
