"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  gerarTexto,
  listarCanais,
  melhorarPolitica,
  obterTexto,
  politicaDeExemplos,
  type Solicitacao,
} from "@/lib/db/comunicacao-textos"
import { type ResultadoIA } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comunicação › Assistente de redação — escrita.
 *
 * `requirePermissao("noticias")` em toda função: Server Actions são
 * alcançáveis por POST direto, não só pela tela.
 */

const BASE = "/painel/comunicacao/textos"

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

// ── Política editorial ───────────────────────────────────────────────────────

export async function salvarPolitica(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("noticias")
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const linha = {
    emp_proprietaria_id: emp,
    politica: txt(fd, "politica") || null,
    publico_padrao: txt(fd, "publico_padrao") || null,
    tom_padrao: txt(fd, "tom_padrao") || null,
    termos_evitar: txt(fd, "termos_evitar") || null,
    assinatura: txt(fd, "assinatura") || null,
    atualizada_por: sessao.usuario.id,
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin
    .from("comunicacao_politica")
    .upsert(linha, { onConflict: "emp_proprietaria_id" })
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  revalidatePath(`${BASE}/politica`)
  return { ok: "Política editorial salva." }
}

/** Botão "Melhorar com IA" do campo da política. */
export async function melhorarPoliticaAction(input: {
  texto: string
}): Promise<ResultadoIA> {
  await requirePermissao("noticias")
  const t = (input.texto ?? "").trim()
  if (t.length < 30) {
    return { erro: "Escreva ao menos algumas linhas da política antes de pedir ajuda à IA." }
  }
  return melhorarPolitica(t)
}

/** Deduz a política a partir de textos já publicados na internet. */
export async function aprenderComPublicadosAction(input: {
  urls: string
  atual: string
}): Promise<ResultadoIA> {
  await requirePermissao("noticias")
  const urls = (input.urls ?? "")
    .split(/[\s,;]+/)
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`))
    .slice(0, 8) // teto: cada página custa tokens

  if (urls.length === 0) {
    return { erro: "Informe ao menos um endereço de texto já publicado." }
  }
  return politicaDeExemplos(urls, input.atual ?? "")
}

// ── Canais ───────────────────────────────────────────────────────────────────

export async function salvarCanal(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  const nome = txt(fd, "nome")
  if (!nome) return { erro: "Informe o nome do canal." }

  const limiteBruto = txt(fd, "limite_caracteres")
  const limite = limiteBruto ? Number(limiteBruto) : null
  if (limite !== null && (!Number.isFinite(limite) || limite < 50 || limite > 20000)) {
    return { erro: "O tamanho sugerido deve ficar entre 50 e 20.000 caracteres." }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const dados = {
    nome,
    limite_caracteres: limite,
    orientacoes: txt(fd, "orientacoes") || null,
    suporta_busca: fd.get("suporta_busca") === "on",
    ativo: fd.get("ativo") !== null ? fd.get("ativo") === "on" : true,
    ordem: Number(txt(fd, "ordem") || 0) || 0,
    updated_at: new Date().toISOString(),
  }

  const { error } = id
    ? await admin
        .from("comunicacao_canais")
        .update(dados)
        .eq("id", id)
        .eq("emp_proprietaria_id", emp)
    : await admin
        .from("comunicacao_canais")
        .insert({ ...dados, emp_proprietaria_id: emp })

  if (error) {
    const duplicado = /duplicate|unique/i.test(error.message)
    return {
      erro: duplicado
        ? "Já existe um canal com esse nome."
        : `Não foi possível salvar: ${error.message}`,
    }
  }
  revalidatePath(`${BASE}/canais`)
  return { ok: id ? "Canal atualizado." : "Canal criado." }
}

export async function removerCanal(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  if (!id) return { erro: "Canal não informado." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("comunicacao_canais")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)

  if (error) {
    // textos antigos referenciam o canal — desativar preserva o histórico
    return {
      erro: "Este canal já foi usado em textos. Desative-o em vez de excluir.",
    }
  }
  revalidatePath(`${BASE}/canais`)
  return { ok: "Canal removido." }
}

// ── Geração ──────────────────────────────────────────────────────────────────

/** Lê a solicitação do formulário; devolve erro legível quando falta o essencial. */
async function lerSolicitacao(
  fd: FormData
): Promise<{ erro: string } | { s: Solicitacao }> {
  const fatos = txt(fd, "fatos")
  if (fatos.length < 20) {
    return {
      erro: "Descreva os fatos com um pouco mais de detalhe — é o que impede a IA de inventar.",
    }
  }
  const objetivo = txt(fd, "objetivo")
  if (!objetivo) return { erro: "Escolha o objetivo do texto." }

  const canalId = txt(fd, "canal_id")
  const canais = await listarCanais()
  const canal = canais.find((c) => c.id === canalId) ?? null
  if (!canal) return { erro: "Escolha o local de distribuição." }

  const tamanho = Number(txt(fd, "tamanho")) || canal.limite_caracteres || 1500
  if (tamanho < 50 || tamanho > 20000) {
    return { erro: "O tamanho deve ficar entre 50 e 20.000 caracteres." }
  }

  return {
    s: {
      assunto: txt(fd, "assunto"),
      objetivo,
      canal,
      tamanho,
      fatos,
      publico: txt(fd, "publico"),
      tom: txt(fd, "tom"),
      chamada_acao: txt(fd, "chamada_acao"),
      restricoes: txt(fd, "restricoes"),
      palavras_chave: txt(fd, "palavras_chave"),
      otimizar_busca: fd.get("otimizar_busca") === "on",
    },
  }
}

export async function solicitarTexto(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("noticias")
  const lido = await lerSolicitacao(fd)
  if ("erro" in lido) return { erro: lido.erro }

  const { erro, id } = await gerarTexto(lido.s, sessao.usuario.id)
  if (erro || !id) return { erro: erro ?? "Falha ao gerar o texto." }

  revalidatePath(BASE)
  redirect(`${BASE}/${id}`)
}

/** Regera preservando a solicitação: o usuário só diz o que quer diferente. */
export async function regerarTexto(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("noticias")
  const id = txt(fd, "id")
  const ajuste = txt(fd, "ajuste")
  if (!ajuste) return { erro: "Diga o que deve mudar nesta versão." }

  const achado = await obterTexto(id)
  if (!achado) return { erro: "Texto não encontrado." }
  const t = achado.texto

  const canais = await listarCanais()
  const canal =
    canais.find((c) => c.nome === t.canal_nome) ??
    canais.find((c) => c.id === t.id) ??
    null

  const maiorVersao = Math.max(...achado.versoes.map((v) => v.versao), t.versao)

  const { erro, id: novo } = await gerarTexto(
    {
      assunto: t.assunto ?? "",
      objetivo: t.objetivo ?? "",
      canal,
      tamanho: t.tamanho ?? canal?.limite_caracteres ?? 1500,
      fatos: t.fatos ?? "",
      publico: t.publico ?? "",
      tom: t.tom ?? "",
      chamada_acao: t.chamada_acao ?? "",
      restricoes: t.restricoes ?? "",
      palavras_chave: t.palavras_chave ?? "",
      otimizar_busca: t.otimizar_busca,
      ajuste,
      textoAnterior: t.texto_final || t.texto_gerado || "",
    },
    sessao.usuario.id,
    { familiaId: t.origem_id ?? t.id, versao: maiorVersao }
  )
  if (erro || !novo) return { erro: erro ?? "Falha ao gerar a nova versão." }

  revalidatePath(BASE)
  redirect(`${BASE}/${novo}`)
}

/** Guarda o texto como a pessoa publicou (depois de editar). */
export async function salvarTextoFinal(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  const final = String(fd.get("texto_final") ?? "")
  if (!id) return { erro: "Texto não informado." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("comunicacao_textos")
    .update({ texto_final: final || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  revalidatePath(`${BASE}/${id}`)
  return { ok: "Versão final salva." }
}

export async function excluirTexto(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  if (!id) return { erro: "Texto não informado." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // apaga a família inteira (a original e suas regerações)
  await admin
    .from("comunicacao_textos")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .or(`id.eq.${id},origem_id.eq.${id}`)

  revalidatePath(BASE)
  redirect(BASE)
}
