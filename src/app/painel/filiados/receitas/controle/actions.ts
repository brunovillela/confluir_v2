"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { hojeSP } from "@/lib/db/comum"
import { csvDesconto, dataBr, invalidarContagemDesconto, invalidarExclusoesNaoCumpridas, registrarComunicacao, type AcaoDesconto } from "@/lib/db/desconto-comunicacoes"
import {
  contatosDaFolha,
  excluirEventoRepasse,
  invalidarAvisosRepasse,
  registrarEventoRepasse,
  removerContatoFolha,
  salvarContatoFolha,
  salvarInicioControle,
  salvarRemessaAutomatica,
  encerrarSemValores,
  registrarSemValores,
  salvarRegraRepasse,
  unidadeRepasse,
} from "@/lib/db/repasse"
import { confirmarDeposito } from "@/lib/db/repasse-extrato"
import { cobrarEmLote, usarComoContatoDaFolha } from "@/lib/db/repasse-cobranca"
import { arquivarEnvio, enviarLinkPorEmail, gerarLink, linkDaEmpresa, revogarLink } from "@/lib/db/repasse-link"
import { enviarEmail } from "@/lib/email"
import { escaparHtml, paragrafo, tituloEmail } from "@/lib/email-layout"
import { formatarCnpjCpf, formatarMoeda } from "@/lib/formato"
import {
  competenciaValida,
  ehTipoContribuicao,
  lerMeses,
  MEIOS_COMUNICACAO,
  MEIOS_REPASSE,
  prazoDaCompetencia,
  regraEfetiva,
  rotuloCompetencia,
  TIPOS_CONTRIBUICAO,
  type RegraRepasse,
} from "@/lib/repasse"
import { regrasRepasse } from "@/lib/db/repasse"

const texto = (f: FormData, k: string) => {
  const v = f.get(k)
  return typeof v === "string" && v.trim() ? v.trim() : null
}

async function sessao() {
  const s = await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  return { id: s.usuario.id, nome: s.usuario.nome_completo ?? s.usuario.nome_guerra ?? null }
}

function revalidar(empresaId?: string | null) {
  invalidarAvisosRepasse()
  invalidarContagemDesconto()
  invalidarExclusoesNaoCumpridas()
  revalidatePath("/painel/filiados/receitas/controle")
  revalidatePath("/painel/filiados/receitas/controle/contatos")
  revalidatePath("/painel/filiados/receitas/controle/cobrar")
  if (empresaId) {
    revalidatePath(`/painel/filiados/receitas/controle/${empresaId}`)
    revalidatePath(`/painel/representacao/empregadores/${empresaId}`)
  }
}

function lerDia(f: FormData, k: string): number | null | { erro: string } {
  const v = texto(f, k)
  if (!v) return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 31) return { erro: "O dia precisa ser um número de 1 a 31." }
  return n
}

/** "2026-10" (input month) → 202610. */
function lerCompetenciaMes(v: string | null): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? "")
  return m ? Number(m[1]) * 100 + Number(m[2]) : null
}

// ── Regras ──────────────────────────────────────────────────────────────────

export async function salvarRegrasGeraisAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const desdeTexto = texto(f, "desde")
  const desde = desdeTexto ? lerCompetenciaMes(desdeTexto) : null
  if (desdeTexto && (!desde || !competenciaValida(desde))) return { erro: "Informe o mês de início no formato mês/ano.", campo: "desde" }
  for (const tipo of TIPOS_CONTRIBUICAO) {
    const meses = lerMeses(texto(f, `meses_${tipo}`) ?? "")
    if (meses && !Array.isArray(meses)) return { erro: `${tipo}: ${meses.erro}`, campo: `meses_${tipo}` }
    const envio = lerDia(f, `envio_${tipo}`)
    const deposito = lerDia(f, `deposito_${tipo}`)
    for (const d of [envio, deposito]) if (d && typeof d === "object") return { erro: `${tipo}: ${d.erro}` }
    const regra: RegraRepasse = {
      controla: f.get(`controla_${tipo}`) === "on",
      meses: tipo === "Associativa" ? null : (meses as number[] | null),
      diaEnvio: envio as number | null,
      diaDeposito: deposito as number | null,
    }
    const { erro } = await salvarRegraRepasse(null, tipo, regra, quem.nome)
    if (erro) return { erro }
  }
  const { erro } = await salvarInicioControle(desde)
  if (erro) return { erro }
  const auto = await salvarRemessaAutomatica(f.get("remessa_automatica") === "on")
  if (auto.erro) return { erro: auto.erro }
  revalidar()
  revalidatePath("/painel/filiados/receitas")
  return { ok: "Prazos salvos." }
}

export async function salvarExcecaoAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const empresaId = texto(f, "empresa_id")
  const tipo = texto(f, "tipo")
  if (!empresaId || !ehTipoContribuicao(tipo)) return { erro: "Dados incompletos." }
  const modo = texto(f, "modo")
  let regra: RegraRepasse | null = null
  if (modo === "nao_desconta") {
    regra = { controla: false, meses: null, diaEnvio: null, diaDeposito: null, observacao: texto(f, "observacao") }
  } else if (modo === "propria") {
    const meses = lerMeses(texto(f, "meses") ?? "")
    if (meses && !Array.isArray(meses)) return { erro: meses.erro, campo: "meses" }
    const envio = lerDia(f, "dia_envio")
    const deposito = lerDia(f, "dia_deposito")
    for (const d of [envio, deposito]) if (d && typeof d === "object") return { erro: d.erro }
    regra = {
      controla: true,
      meses: tipo === "Associativa" ? null : (meses as number[] | null),
      diaEnvio: envio as number | null,
      diaDeposito: deposito as number | null,
      observacao: texto(f, "observacao"),
    }
  } else if (modo !== "herdar") {
    return { erro: "Escolha uma opção." }
  }
  const { erro } = await salvarRegraRepasse(empresaId, tipo, regra, quem.nome)
  if (erro) return { erro }
  revalidar(empresaId)
  return { ok: "Regra da empresa salva." }
}

// ── Trilha ──────────────────────────────────────────────────────────────────

export async function registrarEventoAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const empresaId = texto(f, "empresa_id")
  const tipo = texto(f, "tipo")
  const competencia = Number(texto(f, "competencia"))
  const evento = texto(f, "evento")
  if (!empresaId || !ehTipoContribuicao(tipo) || !competenciaValida(competencia)) return { erro: "Dados incompletos." }
  if (evento !== "relacao_recebida" && evento !== "sem_desconto" && evento !== "cobranca" && evento !== "contato") {
    return { erro: "Ação inválida." }
  }
  const meio = texto(f, "meio")
  if (meio && !MEIOS_REPASSE.some((m) => m.valor === meio)) return { erro: "Meio inválido." }
  const observacao = texto(f, "observacao")
  if ((evento === "contato" || evento === "cobranca") && !observacao && !meio) {
    return { erro: "Conte como foi o contato ou escolha o meio.", campo: "observacao" }
  }
  const data = texto(f, "data") ?? hojeSP()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hojeSP()) return { erro: "Data inválida.", campo: "data" }
  const { erro } = await registrarEventoRepasse({
    empresaId,
    competencia,
    tipo,
    evento,
    meio,
    data,
    observacao,
    usuarioId: quem.id,
    usuarioNome: quem.nome,
  })
  if (erro) return { erro }
  revalidar(empresaId)
  const ok = {
    relacao_recebida: "Relação marcada como recebida. Lance-a em Receitas quando puder.",
    sem_desconto: "Registrado: sem desconto nesta competência.",
    cobranca: "Cobrança registrada.",
    contato: "Contato registrado.",
  }[evento]
  return { ok }
}

export async function desfazerEventoAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  await sessao()
  const id = texto(f, "id")
  const empresaId = texto(f, "empresa_id")
  if (!id || !empresaId) return { erro: "Dados incompletos." }
  const { erro } = await excluirEventoRepasse(id, empresaId)
  if (erro) return { erro }
  revalidar(empresaId)
  return { ok: "Desfeito." }
}

// ── Cobrança por e-mail ─────────────────────────────────────────────────────

export async function cobrarPorEmailAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const empresaId = texto(f, "empresa_id")
  const tipo = texto(f, "tipo")
  const competencia = Number(texto(f, "competencia"))
  if (!empresaId || !ehTipoContribuicao(tipo) || !competenciaValida(competencia)) return { erro: "Dados incompletos." }
  const escolhidos = new Set(f.getAll("contato").map(String))
  const contatos = (await contatosDaFolha(empresaId)).filter((c) => escolhidos.has(c.id) && c.email)
  if (contatos.length === 0) return { erro: "Marque ao menos um contato da folha com e-mail." }
  const [unidade, regras, linkRh] = await Promise.all([unidadeRepasse(empresaId), regrasRepasse(), linkDaEmpresa(empresaId)])
  const regra = regraEfetiva(tipo, regras.geral[tipo], regras.porEmpresa.get(empresaId)?.[tipo])
  const falta = texto(f, "falta") === "deposito" ? "deposito" : "relacao"
  const prazo = prazoDaCompetencia(competencia, falta === "deposito" ? regra.diaDeposito : regra.diaEnvio)
  const valor = Number(texto(f, "valor") ?? 0)
  const extra = texto(f, "mensagem")
  const rot = rotuloCompetencia(competencia)
  const assunto =
    falta === "deposito"
      ? `Depósito da contribuição ${tipo.toLowerCase()} de ${rot} — {ENTIDADE}`
      : `Relação de descontos da contribuição ${tipo.toLowerCase()} de ${rot} — {ENTIDADE}`
  const corpo =
    tituloEmail(falta === "deposito" ? `Depósito de ${rot}` : `Relação de descontos de ${rot}`) +
    paragrafo(`Prezados(as) da ${escaparHtml(unidade?.nome ?? "empresa")},`) +
    paragrafo(
      falta === "deposito"
        ? `Recebemos a relação de descontos da contribuição ${escaparHtml(tipo.toLowerCase())} da competência <strong>${rot}</strong>${valor > 0 ? `, no total de <strong>${formatarMoeda(valor)}</strong>` : ""}, mas ainda não identificamos o depósito, que estava previsto até <strong>${dataBr(prazo)}</strong>.`
        : `Ainda não recebemos a relação dos descontos da contribuição ${escaparHtml(tipo.toLowerCase())} da competência <strong>${rot}</strong>, que estava prevista até <strong>${dataBr(prazo)}</strong>.`
    ) +
    paragrafo(
      falta === "deposito"
        ? "Pedimos, por gentileza, que nos enviem o comprovante do depósito, respondendo a este e-mail."
        : "Pedimos, por gentileza, que nos enviem a relação (nome, CPF ou matrícula e valor descontado de cada trabalhador), respondendo a este e-mail. Se não houve desconto nesta competência, basta nos avisar."
    ) +
    (extra ? paragrafo(escaparHtml(extra).replaceAll("\n", "<br>")) : "") +
    (linkRh
      ? paragrafo(
          `Vocês também podem enviar ${falta === "deposito" ? "o recado" : "a relação"} pela página da empresa: <a href="${linkRh.url}">${escaparHtml(linkRh.url)}</a>.`
        )
      : "") +
    paragrafo("Obrigado(a).")
  const enviados: string[] = []
  for (const c of contatos) {
    const ok = await enviarEmail({ email: c.email!, nome: c.nome, assunto, html: corpo })
    if (ok) enviados.push(c.email!)
  }
  if (enviados.length === 0) return { erro: "O e-mail não saiu. Confira a configuração de e-mail da entidade e tente de novo." }
  await registrarEventoRepasse({
    empresaId,
    competencia,
    tipo,
    evento: "cobranca",
    meio: "email",
    data: hojeSP(),
    observacao: `${falta === "deposito" ? "Cobrança do depósito" : "Cobrança da relação"} enviada para ${enviados.join(", ")}.${extra ? ` ${extra}` : ""}`,
    usuarioId: quem.id,
    usuarioNome: quem.nome,
  })
  revalidar(empresaId)
  return { ok: `Cobrança enviada para ${enviados.join(", ")}.` }
}

// ── Contatos da folha ───────────────────────────────────────────────────────

export async function salvarContatoFolhaAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  await sessao()
  const empresaId = texto(f, "empresa_id")
  if (!empresaId) return { erro: "Empresa não informada." }
  const { erro } = await salvarContatoFolha(
    empresaId,
    {
      nome: texto(f, "nome") ?? "",
      cargo: texto(f, "cargo"),
      telefone: texto(f, "telefone"),
      email: texto(f, "email"),
      observacao: texto(f, "observacao"),
    },
    texto(f, "contato_id") ?? undefined
  )
  if (erro) return { erro }
  revalidar(empresaId)
  return { ok: "Contato salvo." }
}

export async function removerContatoFolhaAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  await sessao()
  const empresaId = texto(f, "empresa_id")
  const contatoId = texto(f, "contato_id")
  if (!empresaId || !contatoId) return { erro: "Dados incompletos." }
  const { erro } = await removerContatoFolha(empresaId, contatoId)
  if (erro) return { erro }
  revalidar(empresaId)
  return { ok: "Contato removido." }
}

// ── Inclusões e exclusões ───────────────────────────────────────────────────

export async function comunicarDescontoAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const empresaId = texto(f, "empresa_id")
  if (!empresaId) return { erro: "Empresa não informada." }
  const vinculos = f
    .getAll("item")
    .map(String)
    .flatMap((v) => {
      const [vinculoId, acao] = v.split("|")
      return vinculoId && (acao === "inclusao" || acao === "exclusao") ? [{ vinculoId, acao: acao as AcaoDesconto }] : []
    })
  if (vinculos.length === 0) return { erro: "Marque ao menos uma pessoa." }
  const modo = texto(f, "modo")

  if (modo === "email") {
    const escolhidos = new Set(f.getAll("contato").map(String))
    const contatos = (await contatosDaFolha(empresaId)).filter((c) => escolhidos.has(c.id) && c.email)
    if (contatos.length === 0) return { erro: "Marque ao menos um contato da folha com e-mail." }
    const unidade = await unidadeRepasse(empresaId)
    // Registra primeiro (a lista de pendentes é conferida no servidor) e manda
    // exatamente o que foi registrado.
    const destinatario = contatos.map((c) => c.email).join(", ")
    const r = await registrarComunicacao({
      empresaId,
      vinculos,
      meio: "email",
      destinatario,
      referencia: texto(f, "referencia"),
      observacao: texto(f, "observacao"),
      usuarioId: quem.id,
      usuarioNome: quem.nome,
    })
    if (r.erro || !r.itens) return { erro: r.erro ?? "Não foi possível registrar." }
    const inc = r.itens.filter((i) => i.acao === "inclusao")
    const exc = r.itens.filter((i) => i.acao === "exclusao")
    const tabela = (lista: typeof r.itens, titulo: string) =>
      lista.length === 0
        ? ""
        : `<p style="margin:16px 0 6px;font-weight:600">${titulo} (${lista.length})</p>` +
          `<table style="border-collapse:collapse;width:100%;font-size:13px">` +
          `<tr>${["Nome", "CPF", "Matrícula", "A partir de"].map((h) => `<th style="text-align:left;border-bottom:1px solid #ddd;padding:4px">${h}</th>`).join("")}</tr>` +
          lista
            .map(
              (i) =>
                `<tr><td style="padding:4px;border-bottom:1px solid #eee">${escaparHtml(i.nome)}</td><td style="padding:4px;border-bottom:1px solid #eee">${i.cpf ? formatarCnpjCpf(i.cpf) : ""}</td><td style="padding:4px;border-bottom:1px solid #eee">${escaparHtml(i.matricula ?? "")}</td><td style="padding:4px;border-bottom:1px solid #eee">${dataBr(i.data)}</td></tr>`
            )
            .join("") +
          `</table>`
    const extra = texto(f, "mensagem")
    const corpo =
      tituloEmail("Inclusões e exclusões de desconto") +
      paragrafo(`Prezados(as) da ${escaparHtml(unidade?.nome ?? "empresa")},`) +
      paragrafo(
        "Encaminhamos a relação de trabalhadores que passam a ter e que deixam de ter o desconto da contribuição associativa em folha. A mesma relação segue em planilha anexa."
      ) +
      tabela(inc, "Incluir o desconto") +
      tabela(exc, "Excluir o desconto") +
      (extra ? paragrafo(escaparHtml(extra).replaceAll("\n", "<br>")) : "") +
      paragrafo("Pedimos a gentileza de confirmar o recebimento respondendo a este e-mail.")
    const anexo = { nome: `inclusoes-exclusoes-${hojeSP()}.csv`, base64: Buffer.from(csvDesconto(r.itens), "utf8").toString("base64") }
    const enviados: string[] = []
    for (const c of contatos) {
      const ok = await enviarEmail({
        email: c.email!,
        nome: c.nome,
        assunto: `Inclusões e exclusões de desconto em folha — {ENTIDADE}`,
        html: corpo,
        anexos: [anexo],
      })
      if (ok) enviados.push(c.email!)
    }
    revalidar(empresaId)
    if (enviados.length === 0) {
      return {
        erro: "A comunicação foi registrada, mas o e-mail não saiu. Baixe a planilha no histórico e envie por outro meio.",
      }
    }
    return { ok: `Enviado para ${enviados.join(", ")}: ${inc.length} inclusão(ões) e ${exc.length} exclusão(ões).` }
  }

  if (modo === "link") {
    const linkRh = await linkDaEmpresa(empresaId)
    if (!linkRh) return { erro: "Gere o link do RH desta empresa antes." }
    const escolhidos = new Set(f.getAll("contato").map(String))
    const contatos = (await contatosDaFolha(empresaId)).filter((c) => escolhidos.has(c.id) && c.email)
    const r = await registrarComunicacao({
      empresaId,
      vinculos,
      meio: "link",
      destinatario: contatos.map((c) => c.email).join(", ") || null,
      referencia: null,
      observacao: texto(f, "observacao"),
      usuarioId: quem.id,
      usuarioNome: quem.nome,
    })
    if (r.erro || !r.itens) return { erro: r.erro ?? "Não foi possível registrar." }
    const unidade = await unidadeRepasse(empresaId)
    const inc = r.itens.filter((i) => i.acao === "inclusao").length
    const exc = r.itens.length - inc
    const corpo =
      tituloEmail("Inclusões e exclusões de desconto") +
      paragrafo(`Prezados(as) da ${escaparHtml(unidade?.nome ?? "empresa")},`) +
      paragrafo(
        `Há ${inc} inclusão(ões) e ${exc} exclusão(ões) de desconto da contribuição associativa em folha disponíveis na página da empresa. Por segurança, os nomes não seguem por e-mail.`
      ) +
      `<p style="margin:20px 0"><a href="${linkRh.url}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Ver e confirmar o recebimento</a></p>`
    const enviados: string[] = []
    for (const c of contatos) {
      const ok = await enviarEmail({ email: c.email!, nome: c.nome, assunto: "Inclusões e exclusões de desconto — {ENTIDADE}", html: corpo })
      if (ok) enviados.push(c.email!)
    }
    revalidar(empresaId)
    return {
      ok:
        `Disponibilizado no link do RH: ${inc} inclusão(ões) e ${exc} exclusão(ões).` +
        (contatos.length ? (enviados.length ? ` Aviso enviado para ${enviados.join(", ")}.` : " O aviso por e-mail não saiu.") : ""),
    }
  }

  const meio = texto(f, "meio")
  if (!meio || !MEIOS_COMUNICACAO.some((m) => m.valor === meio)) return { erro: "Escolha por onde foi enviado.", campo: "meio" }
  const r = await registrarComunicacao({
    empresaId,
    vinculos,
    meio,
    destinatario: texto(f, "destinatario"),
    referencia: texto(f, "referencia"),
    observacao: texto(f, "observacao"),
    usuarioId: quem.id,
    usuarioNome: quem.nome,
  })
  if (r.erro) return { erro: r.erro }
  revalidar(empresaId)
  return { ok: `Envio registrado: ${r.itens?.length ?? 0} pessoa(s).` }
}

// ── Sem valores a repassar ──────────────────────────────────────────────────

export async function registrarSemValoresAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const empresaId = texto(f, "empresa_id")
  if (!empresaId) return { erro: "Empresa não informada." }
  const desde = lerCompetenciaMes(texto(f, "desde"))
  if (!desde || !competenciaValida(desde)) return { erro: "Informe a competência a partir da qual não há valores.", campo: "desde" }
  const motivo = texto(f, "motivo")
  if (!motivo) return { erro: "Informe o motivo (ex.: todos os trabalhadores se desfiliaram).", campo: "motivo" }
  const { erro } = await registrarSemValores({ empresaId, desde, motivo, usuarioId: quem.id, usuarioNome: quem.nome })
  if (erro) return { erro }
  revalidar(empresaId)
  return { ok: `Registrado: sem valores a repassar desde ${rotuloCompetencia(desde)}.` }
}

export async function encerrarSemValoresAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const empresaId = texto(f, "empresa_id")
  if (!empresaId) return { erro: "Empresa não informada." }
  const retomada = lerCompetenciaMes(texto(f, "retomada"))
  if (!retomada || !competenciaValida(retomada)) return { erro: "Informe a competência em que o desconto volta.", campo: "retomada" }
  const { erro } = await encerrarSemValores({ empresaId, retomada, usuarioNome: quem.nome })
  if (erro) return { erro }
  revalidar(empresaId)
  return { ok: `O controle volta a cobrar a relação a partir de ${rotuloCompetencia(retomada)}.` }
}

// ── Depósitos achados no extrato ────────────────────────────────────────────

/**
 * Confirma um ou mais créditos do extrato como depósito da empresa
 * (`deposito` = "lancamentoId|remessaId|fonteId", repetível).
 */
export async function confirmarDepositosAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const pares = [...new Set(f.getAll("deposito").map(String))].flatMap((v) => {
    const [lancamentoId, remessaId, fonteId] = v.split("|")
    return lancamentoId && remessaId && fonteId ? [{ lancamentoId, remessaId, fonteId }] : []
  })
  if (pares.length === 0) return { erro: "Marque ao menos um depósito." }
  if (new Set(pares.map((x) => x.lancamentoId)).size !== pares.length) {
    return { erro: "O mesmo crédito do extrato foi marcado para mais de uma relação. Deixe só um." }
  }
  const erros: string[] = []
  let ok = 0
  for (const x of pares) {
    const r = await confirmarDeposito({ ...x, usuarioId: quem.id })
    if (r.erro) erros.push(r.erro)
    else ok++
  }
  revalidar()
  for (const x of pares) revalidatePath(`/painel/filiados/receitas/controle/${x.fonteId}`)
  revalidatePath("/painel/financeiro/conciliacao")
  if (ok === 0) return { erro: erros[0] ?? "Nada foi confirmado." }
  return {
    ok: `${ok} depósito(s) confirmado(s) e conciliado(s) com o extrato.` + (erros.length ? ` ${erros.length} não: ${erros[0]}` : ""),
  }
}

// ── Link do RH ──────────────────────────────────────────────────────────────

export async function gerarLinkAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const empresaId = texto(f, "empresa_id")
  if (!empresaId) return { erro: "Empresa não informada." }
  const { erro } = await gerarLink(empresaId, quem.nome)
  if (erro) return { erro }
  revalidar(empresaId)
  return { ok: "Link gerado. O anterior, se havia, deixou de funcionar." }
}

export async function revogarLinkAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const empresaId = texto(f, "empresa_id")
  if (!empresaId) return { erro: "Empresa não informada." }
  const { erro } = await revogarLink(empresaId, quem.nome)
  if (erro) return { erro }
  revalidar(empresaId)
  return { ok: "Link desativado." }
}

export async function enviarLinkAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  await sessao()
  const empresaId = texto(f, "empresa_id")
  if (!empresaId) return { erro: "Empresa não informada." }
  const escolhidos = new Set(f.getAll("contato").map(String))
  const contatos = (await contatosDaFolha(empresaId)).filter((c) => escolhidos.has(c.id) && c.email)
  if (contatos.length === 0) return { erro: "Marque ao menos um contato da folha com e-mail." }
  const r = await enviarLinkPorEmail(empresaId, contatos.map((c) => ({ nome: c.nome, email: c.email! })))
  if (r.erro) return { erro: r.erro }
  return { ok: `Link enviado para ${r.enviados.join(", ")}.` }
}

export async function arquivarEnvioAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const envioId = texto(f, "envio_id")
  const empresaId = texto(f, "empresa_id")
  if (!envioId) return { erro: "Envio não informado." }
  const { erro } = await arquivarEnvio(envioId, quem.nome)
  if (erro) return { erro }
  revalidar(empresaId)
  return { ok: "Envio arquivado." }
}

// ── Cobrança em lote e contatos sugeridos ───────────────────────────────────

export async function cobrarEmLoteAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const quem = await sessao()
  const ids = [...new Set(f.getAll("empresa").map(String).filter(Boolean))]
  if (ids.length === 0) return { erro: "Marque ao menos uma empresa." }
  const resultados = await cobrarEmLote(ids, texto(f, "mensagem"), quem)
  revalidar()
  for (const id of ids) revalidatePath(`/painel/filiados/receitas/controle/${id}`)
  const ok = resultados.filter((r) => !r.erro)
  const falhas = resultados.filter((r) => r.erro)
  if (ok.length === 0) return { erro: falhas.length ? `Nada enviado: ${falhas.map((r) => `${r.empresa} (${r.erro})`).join("; ")}.` : "Nada enviado." }
  return {
    ok:
      `Cobrança enviada a ${ok.length} empresa(s) e registrada na trilha de cada uma.` +
      (falhas.length ? ` Não foi: ${falhas.map((r) => `${r.empresa} (${r.erro})`).join("; ")}.` : ""),
  }
}

export async function usarComoContatoAction(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  await sessao()
  const empresaId = texto(f, "empresa_id")
  const contatoId = texto(f, "contato_id")
  if (!empresaId || !contatoId) return { erro: "Dados incompletos." }
  const { erro } = await usarComoContatoDaFolha(empresaId, contatoId)
  if (erro) return { erro }
  revalidar(empresaId)
  revalidatePath("/painel/filiados/receitas/controle/contatos")
  return { ok: "Contato da folha definido." }
}
