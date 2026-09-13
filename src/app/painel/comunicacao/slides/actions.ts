"use server"

import { randomBytes } from "node:crypto"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import {
  DESCRICAO_MAX,
  DURACAO_MAXIMA,
  DURACAO_MINIMA,
  FAIXA_QUANTIDADE_MAX,
  TITULO_MAX,
  ehAjuste,
  ehGiro,
  ehOrientacao,
  inteiroEntre,
} from "@/lib/comunicacao-slides-constantes"
import { type EstadoForm } from "@/lib/contas"
import {
  buscarConjuntoSlides,
  buscarSlide,
  removerImagensSlides,
  subirImagemSlide,
} from "@/lib/db/comunicacao-slides"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comunicação › Slides para TV — escrita. O link público de cada conjunto é
 * /tv/<slug>; trocar o slug derruba as TVs que usavam o anterior.
 */

function txt(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? "").trim()
  return v === "" ? null : v
}

function data(fd: FormData, campo: string): string | null {
  const v = txt(fd, campo)
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

/** Slug do link público: 10 caracteres sem os ambíguos (0/o/1/l/i). */
function gerarSlug(): string {
  const alfabeto = "abcdefghjkmnpqrstuvwxyz23456789"
  let s = ""
  for (const b of randomBytes(10)) s += alfabeto[b % alfabeto.length]
  return s
}

function revalidar(conjuntoId?: string) {
  revalidatePath("/painel/comunicacao/slides")
  if (conjuntoId) revalidatePath(`/painel/comunicacao/slides/${conjuntoId}`)
}

async function inserirConjunto(
  campos: Record<string, unknown>
): Promise<{ id: string } | { erro: string }> {
  const admin = await createAdminClient()
  let ultimoErro = ""
  for (let i = 0; i < 3; i++) {
    const { data: criado, error } = await admin
      .from("comunicacao_slides_conjuntos")
      .insert({ ...campos, emp_proprietaria_id: await tenantAtual(), slug: gerarSlug() })
      .select("id")
      .single()
    if (criado) return { id: String(criado.id) }
    ultimoErro = error?.message ?? ""
    if (error && ["PGRST205", "42P01"].includes(error.code ?? "")) {
      return { erro: "Rode supabase/comunicacao-slides-tv.sql no Supabase antes de criar conjuntos." }
    }
  }
  return { erro: `Não foi possível criar o conjunto: ${ultimoErro}` }
}

// ── Conjuntos ────────────────────────────────────────────────────────────────

export async function criarConjuntoSlides(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("noticias")
  const nome = txt(fd, "nome")
  const orientacao = txt(fd, "orientacao")
  if (!nome) return { erro: "Dê um nome ao conjunto (ex.: TV da recepção)." }
  if (!ehOrientacao(orientacao)) return { erro: "Escolha a orientação da TV." }

  const r = await inserirConjunto({
    nome,
    orientacao,
    criado_por: sessao.usuario.id,
  })
  if ("erro" in r) return { erro: r.erro }
  revalidar()
  redirect(`/painel/comunicacao/slides/${r.id}?criado=1`)
}

export async function salvarConjuntoSlides(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  const nome = txt(fd, "nome")
  const orientacao = txt(fd, "orientacao")
  const girar = txt(fd, "girar") ?? "nao"
  const duracao = inteiroEntre(fd.get("duracao_segundos"), DURACAO_MINIMA, DURACAO_MAXIMA)
  const opacidade = inteiroEntre(fd.get("opacidade_logo"), 10, 100)
  const faixaAtiva = fd.get("faixa_ativa") === "on"
  const faixaNoticias = fd.get("faixa_noticias") === "on"
  const quantidade = inteiroEntre(fd.get("faixa_quantidade"), 1, FAIXA_QUANTIDADE_MAX)
  const faixaTexto = txt(fd, "faixa_texto")

  if (!id) return { erro: "Conjunto inválido." }
  if (!nome) return { erro: "Dê um nome ao conjunto." }
  if (!ehOrientacao(orientacao)) return { erro: "Escolha a orientação da TV." }
  if (!ehGiro(girar)) return { erro: "Escolha como a tela deve girar." }
  if (duracao === null) {
    return { erro: `A duração de cada slide vai de ${DURACAO_MINIMA} a ${DURACAO_MAXIMA} segundos.` }
  }
  if (opacidade === null) return { erro: "A opacidade do logo vai de 10% a 100%." }
  if (faixaAtiva && faixaNoticias && quantidade === null) {
    return { erro: `A faixa passa de 1 a ${FAIXA_QUANTIDADE_MAX} notícias.` }
  }
  if (faixaAtiva && !faixaNoticias && !faixaTexto) {
    return { erro: "Para ligar a faixa, marque as notícias ou escreva ao menos uma mensagem." }
  }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("comunicacao_slides_conjuntos")
    .update(
      {
        nome,
        orientacao,
        girar,
        duracao_segundos: duracao,
        mostrar_logo: fd.get("mostrar_logo") === "on",
        opacidade_logo: opacidade,
        faixa_ativa: faixaAtiva,
        faixa_noticias: faixaNoticias,
        faixa_quantidade: quantidade ?? 8,
        faixa_texto: faixaTexto,
        mostrar_relogio: fd.get("mostrar_relogio") === "on",
        publicado: fd.get("publicado") === "on",
        updated_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Conjunto não encontrado." }
  revalidar(id)
  return { ok: "Conjunto salvo. As TVs ligadas atualizam em até 1 minuto." }
}

export async function gerarNovoLinkSlides(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  if (!id) return { erro: "Conjunto inválido." }
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("comunicacao_slides_conjuntos")
    .update(
      { slug: gerarSlug(), ultimo_acesso: null, updated_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível gerar o link: ${error.message}` }
  if (count === 0) return { erro: "Conjunto não encontrado." }
  revalidar(id)
  return { ok: "Link novo gerado. O anterior parou de funcionar — abra o novo nas TVs." }
}

export async function duplicarConjuntoSlides(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("noticias")
  const id = txt(fd, "id")
  const orientacao = txt(fd, "orientacao")
  if (!id) return { erro: "Conjunto inválido." }
  if (!ehOrientacao(orientacao)) return { erro: "Escolha a orientação da cópia." }
  const origem = await buscarConjuntoSlides(id)
  if (!origem) return { erro: "Conjunto não encontrado." }
  const c = origem.conjunto

  const r = await inserirConjunto({
    nome: `${c.nome} (${orientacao})`,
    orientacao,
    girar: orientacao === c.orientacao ? c.girar : "nao",
    duracao_segundos: c.duracaoSegundos,
    mostrar_logo: c.mostrarLogo,
    opacidade_logo: c.opacidadeLogo,
    faixa_ativa: c.faixaAtiva,
    faixa_noticias: c.faixaNoticias,
    faixa_quantidade: c.faixaQuantidade,
    faixa_texto: c.faixaTexto,
    mostrar_relogio: c.mostrarRelogio,
    publicado: c.publicado,
    criado_por: sessao.usuario.id,
  })
  if ("erro" in r) return { erro: r.erro }

  // A cópia aponta para os mesmos arquivos de imagem; a exclusão só apaga o
  // arquivo quando nenhum outro slide o usa.
  if (origem.slides.length > 0) {
    const admin = await createAdminClient()
    const emp = await tenantAtual()
    const { error } = await admin.from("comunicacao_slides").insert(
      origem.slides.map((s, i) => ({
        emp_proprietaria_id: emp,
        conjunto_id: r.id,
        ordem: i + 1,
        titulo: s.titulo,
        descricao: s.descricao,
        imagem_caminho: s.imagemCaminho,
        imagem_url: s.imagemUrl,
        ajuste: s.ajuste,
        duracao_segundos: s.duracaoSegundos,
        exibir_de: s.exibirDe,
        exibir_ate: s.exibirAte,
        ativo: s.ativo,
        criado_por: sessao.usuario.id,
      }))
    )
    if (error) return { erro: `O conjunto foi criado, mas os slides não copiaram: ${error.message}` }
  }
  revalidar()
  redirect(`/painel/comunicacao/slides/${r.id}?duplicado=1`)
}

/** Apaga do bucket os arquivos que nenhum slide restante usa. */
async function limparImagensSemUso(caminhos: (string | null)[]): Promise<void> {
  const candidatos = [...new Set(caminhos.filter((c): c is string => !!c))]
  if (candidatos.length === 0) return
  const admin = await createAdminClient()
  const { data } = await admin
    .from("comunicacao_slides")
    .select("imagem_caminho")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("imagem_caminho", candidatos)
  const emUso = new Set((data ?? []).map((l) => String(l.imagem_caminho)))
  await removerImagensSlides(candidatos.filter((c) => !emUso.has(c)))
}

export async function excluirConjuntoSlides(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  if (!id) return { erro: "Conjunto inválido." }
  const atual = await buscarConjuntoSlides(id)
  if (!atual) return { erro: "Conjunto não encontrado." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("comunicacao_slides_conjuntos")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  await limparImagensSemUso(atual.slides.map((s) => s.imagemCaminho))
  revalidar()
  redirect("/painel/comunicacao/slides?excluido=1")
}

// ── Slides ───────────────────────────────────────────────────────────────────

function arquivoDe(fd: FormData): File | null {
  const f = fd.get("imagem")
  return f instanceof File && f.size > 0 ? f : null
}

/** Cria (sem `id`) ou atualiza um slide. */
export async function salvarSlide(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("noticias")
  const id = txt(fd, "id")
  const conjuntoId = txt(fd, "conjunto_id")
  const titulo = txt(fd, "titulo")
  const descricao = txt(fd, "descricao")
  const ajuste = txt(fd, "ajuste") ?? "cobrir"
  const duracaoBruta = txt(fd, "duracao_segundos")
  const duracao = inteiroEntre(duracaoBruta, DURACAO_MINIMA, DURACAO_MAXIMA)
  const exibirDe = data(fd, "exibir_de")
  const exibirAte = data(fd, "exibir_ate")
  const arquivo = arquivoDe(fd)
  const removerImagem = fd.get("remover_imagem") === "on"

  if (!conjuntoId) return { erro: "Conjunto inválido." }
  if (titulo && titulo.length > TITULO_MAX) {
    return { erro: `O título passa de ${TITULO_MAX} caracteres — na TV ele precisa ser lido de longe.` }
  }
  if (descricao && descricao.length > DESCRICAO_MAX) {
    return { erro: `A descrição passa de ${DESCRICAO_MAX} caracteres.` }
  }
  if (!ehAjuste(ajuste)) return { erro: "Escolha como a imagem ocupa a tela." }
  if (duracaoBruta && duracao === null) {
    return { erro: `A duração vai de ${DURACAO_MINIMA} a ${DURACAO_MAXIMA} segundos (vazio usa a do conjunto).` }
  }
  if (exibirDe && exibirAte && exibirAte < exibirDe) {
    return { erro: "O fim da exibição é anterior ao início." }
  }

  const conjunto = await buscarConjuntoSlides(conjuntoId)
  if (!conjunto) return { erro: "Conjunto não encontrado." }
  const anterior = id ? conjunto.slides.find((s) => s.id === id) : null
  if (id && !anterior) return { erro: "Slide não encontrado." }

  let imagem = {
    caminho: removerImagem ? null : (anterior?.imagemCaminho ?? null),
    url: removerImagem ? null : (anterior?.imagemUrl ?? null),
  }
  if (!arquivo && !imagem.url && !titulo) {
    return { erro: "O slide precisa de uma imagem ou de um título." }
  }
  if (arquivo) {
    const subida = await subirImagemSlide(arquivo)
    if ("erro" in subida) return { erro: subida.erro }
    imagem = { caminho: subida.caminho, url: subida.url }
  }

  const campos = {
    titulo,
    descricao,
    ajuste,
    duracao_segundos: duracao,
    exibir_de: exibirDe,
    exibir_ate: exibirAte,
    imagem_caminho: imagem.caminho,
    imagem_url: imagem.url,
    updated_at: new Date().toISOString(),
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if (anterior) {
    const { error } = await admin
      .from("comunicacao_slides")
      .update(campos)
      .eq("id", anterior.id)
      .eq("emp_proprietaria_id", emp)
    if (error) {
      if (arquivo) await removerImagensSlides([imagem.caminho])
      return { erro: `Não foi possível salvar o slide: ${error.message}` }
    }
    if (anterior.imagemCaminho && anterior.imagemCaminho !== imagem.caminho) {
      await limparImagensSemUso([anterior.imagemCaminho])
    }
    revalidar(conjuntoId)
    return { ok: "Slide salvo." }
  }

  const ordem = conjunto.slides.reduce((m, s) => Math.max(m, s.ordem), 0) + 1
  const { error } = await admin.from("comunicacao_slides").insert({
    ...campos,
    emp_proprietaria_id: emp,
    conjunto_id: conjuntoId,
    ordem,
    ativo: true,
    criado_por: sessao.usuario.id,
  })
  if (error) {
    if (arquivo) await removerImagensSlides([imagem.caminho])
    return { erro: `Não foi possível adicionar o slide: ${error.message}` }
  }
  revalidar(conjuntoId)
  return { ok: "Slide adicionado ao fim da sequência." }
}

export async function alternarSlide(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const slide = await buscarSlide(txt(fd, "id") ?? "")
  if (!slide) return { erro: "Slide não encontrado." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("comunicacao_slides")
    .update({ ativo: !slide.ativo, updated_at: new Date().toISOString() })
    .eq("id", slide.id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível alterar: ${error.message}` }
  revalidar(slide.conjuntoId)
  return {}
}

/** Sobe/desce o slide trocando de posição com o vizinho. */
export async function moverSlide(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const direcao = txt(fd, "direcao")
  const slide = await buscarSlide(txt(fd, "id") ?? "")
  if (!slide || (direcao !== "subir" && direcao !== "descer")) {
    return { erro: "Movimento inválido." }
  }
  const conjunto = await buscarConjuntoSlides(slide.conjuntoId)
  if (!conjunto) return { erro: "Conjunto não encontrado." }
  const lista = conjunto.slides
  const i = lista.findIndex((s) => s.id === slide.id)
  const j = direcao === "subir" ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= lista.length) return {}

  const nova = lista.map((s) => s.id)
  ;[nova[i], nova[j]] = [nova[j], nova[i]]
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  for (let k = 0; k < nova.length; k++) {
    if (lista[k].id === nova[k] && lista[k].ordem === k + 1) continue
    const { error } = await admin
      .from("comunicacao_slides")
      .update({ ordem: k + 1 })
      .eq("id", nova[k])
      .eq("emp_proprietaria_id", emp)
    if (error) return { erro: `Não foi possível reordenar: ${error.message}` }
  }
  revalidar(slide.conjuntoId)
  return {}
}

export async function excluirSlide(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const slide = await buscarSlide(txt(fd, "id") ?? "")
  if (!slide) return { erro: "Slide não encontrado." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("comunicacao_slides")
    .delete()
    .eq("id", slide.id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  await limparImagensSemUso([slide.imagemCaminho])
  revalidar(slide.conjuntoId)
  return { ok: "Slide excluído." }
}
