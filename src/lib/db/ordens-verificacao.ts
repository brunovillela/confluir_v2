import "server-only"

import {
  CRITERIOS_DESCRICAO_PADRAO,
  origemDoTipo,
  type OrigemOrdem,
  type Severidade,
} from "@/lib/auditoria-regras-catalogo"
import type { Apontamento } from "@/lib/auditoria-confirmacao"
import { validarCnpj, validarCpf } from "@/lib/cpf"
import { regrasConfiguradas, type RegraConfigurada } from "@/lib/db/auditoria-regras"
import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import { registrarEvento, SITUACAO_AGUARDANDO_DOCUMENTO, usuarioDaTrilha } from "@/lib/db/ordens-ciclo"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { gerarJsonIA } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * VERIFICAÇÃO NA CRIAÇÃO das ordens de pagamento. Todo gatilho que cria ordem
 * passa por `inserirOrdensVerificadas`: as regras da origem (configuradas em
 * Financeiro → Auditoria das ordens) são conferidas sobre a linha que vai ser
 * gravada. Regra "bloquear" que falha impede a criação; "alertar" cria a
 * ordem e registra o alerta; "aceitar" não verifica. O resultado de cada
 * verificação fica em `ordens_pagamento_verificacoes`.
 *
 * CONFIRMAÇÃO (03/10/2026 — Compras, RPA e Contratos): com `ctx.confirmacao`,
 * nada é gravado enquanto houver apontamento que quem registra não viu. O
 * gatilho desfaz o que já fez e devolve os `apontamentos` para a tela de
 * confirmação: quem registra ajusta (e a análise roda de novo) ou confirma os
 * alertas — os códigos confirmados voltam em `confirmacao.codigos`. Bloqueio
 * nunca se confirma: só some ajustando.
 */

type Linha = Record<string, unknown>

/** Dados da origem que não estão na linha da ordem. */
export type ContextoVerificacao = {
  /** Diária: início do período. */
  dataInicio?: string | null
  /** Multa: condutor infrator (presente = regra se aplica). */
  condutorId?: string | null
  /** Reembolso: comprovante da despesa (presente = regra se aplica). */
  comprovante?: string | null
  /** Hospedagem: a nota fica na fatura, não na ordem. */
  notaFiscal?: string | null
  /**
   * Fluxo com tela de confirmação: os alertas que quem registra já viu e
   * aceitou. Presente (mesmo vazio) = alerta não confirmado impede a gravação.
   */
  confirmacao?: Confirmacao
}

export type { Apontamento }

/** Os códigos de alerta confirmados por quem registra. */
export type Confirmacao = { codigos: string[] }


/** Lê a confirmação do formulário (campo oculto "confirmados", códigos por vírgula). */
export function lerConfirmacao(fd: FormData): Confirmacao {
  const bruto = String(fd.get("confirmados") ?? "")
  return { codigos: bruto.split(",").map((c) => c.trim()).filter(Boolean) }
}

/** As falhas de um lote, uma por regra (parcelas repetem a mesma). */
function apontamentosDe(resultados: ResultadoVerificacao[][], confirmacao: Confirmacao): Apontamento[] {
  const vistos = new Map<string, Apontamento>()
  for (const lista of resultados) {
    for (const v of lista) {
      if (v.status !== "falha" || vistos.has(v.codigo)) continue
      const bloqueia = v.severidade === "bloquear"
      vistos.set(v.codigo, {
        codigo: v.codigo,
        titulo: v.titulo,
        detalhe: v.detalhe,
        bloqueia,
        confirmado: !bloqueia && confirmacao.codigos.includes(v.codigo),
      })
    }
  }
  return [...vistos.values()]
}

/** Há o que mostrar antes de gravar? (bloqueio, ou alerta ainda não confirmado) */
function precisaConfirmar(apontamentos: Apontamento[]): boolean {
  return apontamentos.some((a) => a.bloqueia || !a.confirmado)
}

export type StatusVerificacao = "ok" | "falha" | "na"

export type ResultadoVerificacao = {
  codigo: string
  titulo: string
  severidade: Severidade
  status: StatusVerificacao
  detalhe: string
}

const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const n = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const digitos = (v: string | null) => (v ?? "").replace(/\D/g, "")

function documentoValido(d: string): boolean {
  return d.length === 11 ? validarCpf(d) : d.length === 14 ? validarCnpj(d) : false
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

function diasEntre(de: string, ate: string): number {
  return Math.round((new Date(`${ate}T12:00:00`).getTime() - new Date(`${de}T12:00:00`).getTime()) / 864e5)
}

/** Chave Pix de dentro de um BR Code (EMV: campo 26, subcampo 01). */
export function chaveDoBrCode(payload: string): string | null {
  const ler = (s: string): Map<string, string> => {
    const m = new Map<string, string>()
    let i = 0
    while (i + 4 <= s.length) {
      const id = s.slice(i, i + 2)
      const tam = Number(s.slice(i + 2, i + 4))
      if (!Number.isFinite(tam)) break
      m.set(id, s.slice(i + 4, i + 4 + tam))
      i += 4 + tam
    }
    return m
  }
  const conta = ler(payload.replace(/\s/g, "")).get("26")
  return conta ? (ler(conta).get("01") ?? null) : null
}

/** A chave é um CPF/CNPJ? Devolve os dígitos, senão null. */
function chaveComoDocumento(chave: string, tipo: string | null): string | null {
  if (/@/.test(chave) || /^\+/.test(chave.trim())) return null
  const d = digitos(chave)
  if (tipo && /cpf|cnpj/i.test(tipo)) return d || null
  if (/^[\d.\-/\s]+$/.test(chave) && documentoValido(d)) return d
  return null
}

/** Cache de consultas de uma verificação (uma ordem ou um lote). */
function cache() {
  const m = new Map<string, Promise<Linha | null>>()
  return async (tabela: string, id: unknown): Promise<Linha | null> => {
    const s = t(id)
    if (!s) return null
    const k = `${tabela}:${s}`
    if (!m.has(k)) {
      m.set(
        k,
        (async () => {
          const admin = await createAdminClient()
          const { data } = await admin.from(tabela).select("*").eq("id", s).maybeSingle()
          return (data as Linha | null) ?? null
        })()
      )
    }
    return m.get(k)!
  }
}

const SISTEMA_DESCRICAO = `Você audita ordens de pagamento de um sindicato. Avalie se a DESCRIÇÃO da despesa atende aos critérios mínimos informados — como faria um auditor: ela precisa se sustentar sozinha para quem autoriza o pagamento e para a auditoria.
Seja objetivo. Não exija o que os critérios não pedem. Considere o tipo da ordem e o valor.
Devolva um JSON com: "atende" (true/false), "faltando" (lista curta do que falta, vazia se atende) e "comentario" (uma frase).`

async function avaliarDescricaoIA(
  descricao: string,
  criterios: string,
  tipo: string,
  valor: number | null
): Promise<{ status: StatusVerificacao; detalhe: string }> {
  const { dados, erro } = await gerarJsonIA({
    system: SISTEMA_DESCRICAO,
    prompt: [
      `Critérios mínimos: ${criterios}`,
      `Tipo da ordem: ${tipo}`,
      `Valor: ${valor === null ? "—" : formatarMoeda(valor)}`,
      `Descrição: ${descricao}`,
    ].join("\n"),
  })
  if (erro || !dados) return { status: "na", detalhe: `IA indisponível — não avaliada (${erro ?? "sem resposta"}).` }
  const faltando = Array.isArray(dados.faltando) ? dados.faltando.map(String).filter(Boolean) : []
  const comentario = typeof dados.comentario === "string" ? dados.comentario : ""
  return dados.atende === true
    ? { status: "ok", detalhe: comentario || "A descrição atende aos critérios." }
    : { status: "falha", detalhe: `${faltando.length ? `Falta: ${faltando.join("; ")}.` : ""} ${comentario}`.trim() }
}

async function verificarLinha(
  linha: Linha,
  regras: RegraConfigurada[],
  ctx: ContextoVerificacao,
  buscar: ReturnType<typeof cache>,
  memoIA: Map<string, { status: StatusVerificacao; detalhe: string }>
): Promise<ResultadoVerificacao[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const tipo = t(linha.tipo) ?? ""
  const valor = n(linha.valor_inicial_cobranca)
  const venc = t(linha.vencimento)
  const fornId = t(linha.beneficiario_fornecedor_id) ?? t(linha.fornecedor_id)
  const usuarioId = t(linha.beneficiario_usuario_id)

  const fornecedor = fornId ? await buscar("empresa", fornId) : null
  const usuario = usuarioId ? await buscar("usuarios", usuarioId) : null
  const docFavorecido = digitos(t(fornecedor?.cnpj_cpf) ?? t(usuario?.cpf) ?? t(linha.beneficiario_doc_avulso))

  const saida: ResultadoVerificacao[] = []
  for (const { regra, severidade, parametros: p } of regras) {
    const r = (status: StatusVerificacao, detalhe: string) =>
      saida.push({ codigo: regra.codigo, titulo: regra.titulo, severidade, status, detalhe })

    switch (regra.codigo) {
      case "favorecido_documento": {
        if (!docFavorecido) r("falha", "Favorecido sem CPF/CNPJ no cadastro.")
        else if (!documentoValido(docFavorecido)) r("falha", `CPF/CNPJ inválido (${docFavorecido}).`)
        else r("ok", "CPF/CNPJ válido.")
        break
      }
      case "fornecedor_bloqueado": {
        if (!fornecedor) r("na", "A ordem não é para um fornecedor.")
        else if (fornecedor.fornecedor_bloqueado === true || fornecedor.bloqueado === true) r("falha", "O fornecedor está BLOQUEADO no cadastro.")
        else r("ok", "Fornecedor ativo.")
        break
      }
      case "fornecedor_recente": {
        const criado = t(fornecedor?.created_at)?.slice(0, 10)
        const dias = n(p.dias) ?? 30
        if (!fornecedor || !criado) r("na", "Sem data de cadastro do fornecedor.")
        else if (diasEntre(criado, hoje) < dias) r("falha", `Fornecedor cadastrado em ${formatarData(criado)}, há ${diasEntre(criado, hoje)} dia(s).`)
        else r("ok", `Cadastrado em ${formatarData(criado)}.`)
        break
      }
      case "pix_divergente": {
        let chave: string | null = null
        let tipoChave: string | null = null
        const db = await buscar("dados_bancarios", linha.dados_bancarios_id)
        if (db && t(db.pix)) {
          chave = t(db.pix)
          tipoChave = t(db.pix_tipo)
        } else if (t(linha.pix_codigo)) {
          const c = t(linha.pix_codigo)!
          chave = c.replace(/\s/g, "").startsWith("000201") ? chaveDoBrCode(c) : c
        }
        if (!chave) {
          r("na", /pix/i.test(t(linha.forma_pagamento) ?? "") ? "Pagamento por Pix sem chave informada na ordem." : "A ordem não tem chave Pix.")
          break
        }
        const doc = chaveComoDocumento(chave, tipoChave)
        if (doc) {
          if (!docFavorecido) r("falha", `Chave Pix ${doc}, mas o favorecido não tem CPF/CNPJ para comparar.`)
          else if (doc === docFavorecido) r("ok", "A chave Pix é o CPF/CNPJ do favorecido.")
          else r("falha", `A chave Pix (${doc}) é de outro CPF/CNPJ — o favorecido é ${docFavorecido}.`)
        } else if (p.exigir_documento === true) {
          r("falha", `A chave Pix (${chave}) não é o CPF/CNPJ do favorecido.`)
        } else {
          r("ok", "Chave de e-mail, telefone ou aleatória — não comparável com o CPF/CNPJ.")
        }
        break
      }
      case "sem_centro_custo": {
        r(t(linha.centro_custo_despesa_id) ? "ok" : "falha", t(linha.centro_custo_despesa_id) ? "Informado." : "Sem centro de custo da despesa.")
        break
      }
      case "duplicidade": {
        if (valor === null || (!fornId && !usuarioId)) {
          r("na", "Sem valor ou favorecido para comparar.")
          break
        }
        const dias = n(p.dias) ?? 7
        const base = venc ?? hoje
        let q = admin
          .from("ordens_pagamento")
          .select("codigo")
          .eq("emp_proprietaria_id", emp)
          .eq("valor_inicial_cobranca", valor)
          .not("situacao", "in", '("Cancelada","Estornado")')
          .not("excluido", "is", true)
          .gte("vencimento", somarDias(base, -dias))
          .lte("vencimento", somarDias(base, dias))
        // Reverificação de uma ordem já gravada: ela mesma não é duplicidade.
        if (t(linha.id)) q = q.neq("id", t(linha.id)!)
        q = fornId ? q.eq("beneficiario_fornecedor_id", fornId) : q.eq("beneficiario_usuario_id", usuarioId!)
        const { data } = await q.limit(5)
        const cods = (data ?? []).map((o) => t(o.codigo)).filter(Boolean)
        r(cods.length ? "falha" : "ok", cods.length ? `Mesmo favorecido e valor em ±${dias} dias: ${cods.join(", ")}.` : "Nenhuma ordem parecida.")
        break
      }
      case "vencimento_passado": {
        const tol = n(p.tolerancia) ?? 0
        if (!venc) r("na", "A ordem não tem vencimento.")
        else if (venc < somarDias(hoje, -tol)) r("falha", `Vencimento ${formatarData(venc)} já passou.`)
        else r("ok", `Vence em ${formatarData(venc)}.`)
        break
      }
      case "descricao_ia": {
        const minimo = n(p.valor_minimo) ?? 0
        const descricao = t(linha.descricao)
        if (!descricao) {
          r("falha", "A ordem não tem descrição.")
          break
        }
        if (valor !== null && valor < minimo) {
          r("na", `Abaixo de ${formatarMoeda(minimo)} — não avaliada.`)
          break
        }
        // Parcelas de um lote têm a mesma descrição-base: avalia uma vez.
        const chaveMemo = descricao.replace(/parcela \d+\/\d+.*$/i, "").trim()
        if (!memoIA.has(chaveMemo)) {
          memoIA.set(chaveMemo, await avaliarDescricaoIA(descricao, String(p.criterios || CRITERIOS_DESCRICAO_PADRAO), tipo, valor))
        }
        const v = memoIA.get(chaveMemo)!
        r(v.status, v.detalhe)
        break
      }
      case "proposta_unica": {
        const proc = await buscar("compras_solicitacoes", linha.processo_compra_id)
        if (!proc || proc.aquisicao_direta !== false) {
          r("na", "Não é compra pelo setor de Aquisição.")
          break
        }
        const { count } = await admin
          .from("compras_propostas")
          .select("id", { count: "exact", head: true })
          .eq("processo_compra_id", String(proc.id))
        const limite = n(p.valor) ?? 0
        if ((count ?? 0) > 1) r("ok", `${count} propostas.`)
        else if (valor !== null && valor > limite) r("falha", `Uma só proposta para ${formatarMoeda(valor)} — aceito até ${formatarMoeda(limite)}.`)
        else r("ok", `Uma só proposta, dentro do limite de ${formatarMoeda(limite)}.`)
        break
      }
      case "direta_limite": {
        const proc = await buscar("compras_solicitacoes", linha.processo_compra_id)
        const limite = n(p.valor) ?? 0
        if (!proc || proc.aquisicao_direta !== true) r("na", "Não é aquisição direta.")
        else if (valor !== null && valor > limite) r("falha", `Aquisição direta de ${formatarMoeda(valor)} — aceita até ${formatarMoeda(limite)}.`)
        else r("ok", `Dentro do limite de ${formatarMoeda(limite)}.`)
        break
      }
      case "sem_documento_fiscal": {
        // Parcela recorrente de contrato: a nota vem depois, e a ordem só
        // segue para autorização com ela (reanalisada nesse momento).
        if (t(linha.situacao) === SITUACAO_AGUARDANDO_DOCUMENTO) {
          r("na", "A nota da competência vem depois — a ordem aguarda o documento fiscal.")
          break
        }
        const tem = Boolean(t(linha.arquivo_nota_fiscal) || t(ctx.notaFiscal))
        r(tem ? "ok" : "falha", tem ? "Anexado." : "Sem nota fiscal ou documento equivalente.")
        break
      }
      case "contrato_vencido": {
        const aluguel = await buscar("veiculo_contratos_aluguel", linha.contrato_aluguel_id)
        const contrato = aluguel ? null : await buscar("contratos", linha.contrato_id)
        const c = aluguel ?? contrato
        if (!c) {
          r("na", "A ordem não tem contrato vinculado.")
          break
        }
        const inicio = t(c.vigencia_inicio)
        const fim = t(c.vigencia_termino)
        const ref = venc ?? hoje
        const tol = n(p.tolerancia) ?? 0
        if (aluguel?.finalizado === true) r("falha", "O contrato de locação está finalizado.")
        else if (fim && ref > somarDias(fim, tol)) r("falha", `Vencimento ${formatarData(ref)} depois do fim da vigência (${formatarData(fim)}).`)
        else if (inicio && ref < inicio) r("falha", `Vencimento ${formatarData(ref)} antes do início da vigência (${formatarData(inicio)}).`)
        else r("ok", `Dentro da vigência${fim ? ` (até ${formatarData(fim)})` : ""}.`)
        break
      }
      case "valor_diferente_contrato": {
        const aluguel = await buscar("veiculo_contratos_aluguel", linha.contrato_aluguel_id)
        const contrato = aluguel ? null : await buscar("contratos", linha.contrato_id)
        const contratado = aluguel ? n(aluguel.valor_mensal) : n(contrato?.valor)
        if ((!aluguel && !contrato) || contratado === null || valor === null) r("na", "Sem valor contratado para comparar.")
        else if (Math.abs(contratado - valor) >= 0.01) r("falha", `Parcela de ${formatarMoeda(valor)} × contratado ${formatarMoeda(contratado)}.`)
        else r("ok", `Igual ao contratado (${formatarMoeda(contratado)}).`)
        break
      }
      case "contrato_sem_documento": {
        const aluguel = await buscar("veiculo_contratos_aluguel", linha.contrato_aluguel_id)
        const contrato = aluguel ? null : await buscar("contratos", linha.contrato_id)
        if (!aluguel && !contrato) r("na", "A ordem não tem contrato vinculado.")
        else {
          const doc = aluguel ? t(aluguel.arquivo_contrato_url) : t(contrato?.arquivo_contrato)
          r(doc ? "ok" : "falha", doc ? "Contrato assinado anexado." : "O contrato não tem o documento assinado anexado.")
        }
        break
      }
      case "rpa_teto_mensal": {
        if (!fornId || valor === null) {
          r("na", "Sem prestador ou valor.")
          break
        }
        const ref = venc ?? hoje
        const ini = `${ref.slice(0, 7)}-01`
        const fimMes = somarDias(somarDias(ini, 32).slice(0, 7) + "-01", -1)
        const { data } = await admin
          .from("ordens_pagamento")
          .select("valor_inicial_cobranca")
          .eq("emp_proprietaria_id", emp)
          .eq("tipo", "RPA")
          .eq("beneficiario_fornecedor_id", fornId)
          .not("situacao", "in", '("Cancelada","Estornado")')
          .gte("vencimento", ini)
          .lte("vencimento", fimMes)
        const soma = (data ?? []).reduce((a, o) => a + (n(o.valor_inicial_cobranca) ?? 0), 0) + valor
        const teto = n(p.valor) ?? 0
        r(soma > teto ? "falha" : "ok", `${formatarMoeda(soma)} no mês ${ref.slice(5, 7)}/${ref.slice(0, 4)} com esta ordem — teto ${formatarMoeda(teto)}.`)
        break
      }
      case "folha_sem_conta": {
        if (!usuarioId) {
          r("na", "Sem funcionário.")
          break
        }
        const { data } = await admin.from("dados_bancarios").select("pix, conta").eq("usuario_id", usuarioId)
        const tem = (data ?? []).some((d) => t(d.pix) || t(d.conta))
        r(tem ? "ok" : "falha", tem ? "Conta ou chave Pix cadastrada." : "Funcionário sem conta bancária nem chave Pix.")
        break
      }
      case "diaria_retroativa": {
        const ini = t(ctx.dataInicio)
        const dias = n(p.dias) ?? 30
        if (!ini) r("na", "Sem data de início do período.")
        else if (diasEntre(ini, hoje) > dias) r("falha", `Período iniciado em ${formatarData(ini)}, há ${diasEntre(ini, hoje)} dias.`)
        else r("ok", `Período iniciado em ${formatarData(ini)}.`)
        break
      }
      case "multa_sem_condutor": {
        if (!("condutorId" in ctx)) r("na", "—")
        else r(t(ctx.condutorId) ? "ok" : "falha", t(ctx.condutorId) ? "Condutor identificado." : "Multa sem condutor infrator identificado.")
        break
      }
      case "reembolso_sem_comprovante": {
        if (!("comprovante" in ctx)) r("na", "Este reembolso não tem comprovante previsto (reembolso a filiado).")
        else r(t(ctx.comprovante) ? "ok" : "falha", t(ctx.comprovante) ? "Comprovante anexado." : "Sem comprovante da despesa.")
        break
      }
      default:
        r("na", "Regra sem verificação implementada.")
    }
  }
  return saida
}

/** Confere as regras de uma ordem (ou lote) sem gravar nada. */
export async function verificarOrdens(
  linhas: Linha[],
  ctx: ContextoVerificacao = {}
): Promise<{ origem: OrigemOrdem | null; resultados: ResultadoVerificacao[][] }> {
  const origem = origemDoTipo(t(linhas[0]?.tipo))
  if (!origem) return { origem: null, resultados: linhas.map(() => []) }
  const regras = (await regrasConfiguradas(origem)).filter((r) => r.severidade !== "aceitar")
  const buscar = cache()
  const memoIA = new Map<string, { status: StatusVerificacao; detalhe: string }>()
  const resultados: ResultadoVerificacao[][] = []
  for (const l of linhas) resultados.push(await verificarLinha(l, regras, ctx, buscar, memoIA))
  return { origem, resultados }
}

/**
 * Insere ordem(ns) de pagamento DEPOIS de conferir as regras da origem.
 * Regra "bloquear" que falha → nada é gravado e volta o motivo. Senão grava as
 * ordens e o resultado de cada verificação.
 */
export async function inserirOrdensVerificadas(
  linhas: Linha[],
  ctx: ContextoVerificacao = {}
): Promise<{ ids?: string[]; alertas?: number; erro?: string; apontamentos?: Apontamento[] }> {
  if (linhas.length === 0) return { ids: [] }
  const { origem, resultados } = await verificarOrdens(linhas, ctx)

  // Fluxo com confirmação: nada se grava enquanto houver o que mostrar.
  if (ctx.confirmacao) {
    const apontamentos = apontamentosDe(resultados, ctx.confirmacao)
    if (precisaConfirmar(apontamentos)) {
      return { apontamentos, erro: "A análise encontrou apontamentos — confirme ou ajuste antes de registrar." }
    }
  }

  const bloqueios = new Map<string, string>()
  for (const lista of resultados) {
    for (const v of lista) {
      if (v.status === "falha" && v.severidade === "bloquear" && !bloqueios.has(v.codigo)) {
        bloqueios.set(v.codigo, `${v.titulo}: ${v.detalhe}`)
      }
    }
  }
  if (bloqueios.size) {
    return {
      erro: `bloqueada pela auditoria do Financeiro — ${[...bloqueios.values()].join(" | ")}. Corrija a origem ou peça a revisão da regra em Financeiro → Auditoria das ordens.`,
    }
  }

  const admin = await createAdminClient()
  const { data, error } = await admin.from("ordens_pagamento").insert(linhas).select("id")
  if (error || !data) {
    return { erro: `Não foi possível gerar a ordem de pagamento: ${error?.message ?? "sem retorno"}` }
  }
  const ids = data.map((o) => String(o.id))

  let alertas = 0
  if (origem) {
    const emp = await tenantAtual()
    const registros = ids.flatMap((ordemId, i) =>
      (resultados[i] ?? []).map((v) => {
        if (v.status === "falha") alertas++
        return {
          emp_proprietaria_id: emp,
          ordem_id: ordemId,
          origem,
          codigo: v.codigo,
          titulo: v.titulo,
          severidade: v.severidade,
          status: v.status === "falha" ? "alerta" : v.status,
          detalhe: v.detalhe,
        }
      })
    )
    if (registros.length) {
      const { error: erroReg } = await admin.from("ordens_pagamento_verificacoes").insert(registros)
      if (erroReg && !esquemaAusente(erroReg)) console.error("verificações:", erroReg.message)
    }
    const usuario = await usuarioDaTrilha()
    for (const [i, ordemId] of ids.entries()) {
      const lista = resultados[i] ?? []
      const al = lista.filter((v) => v.status === "falha").length
      const confirmados = ctx.confirmacao && al ? " — confirmados por quem registrou, sem ajuste" : ""
      await registrarEvento(
        ordemId,
        "verificada",
        usuario,
        `${lista.length} verificação(ões) na criação — ${al ? `${al} alerta(s)` : "sem alertas"}${confirmados}.`,
        {
          alertas: lista.filter((v) => v.status === "falha").map((v) => v.codigo),
          ...(ctx.confirmacao && al ? { confirmados: ctx.confirmacao.codigos } : {}),
        }
      )
    }
  }
  return { ids, alertas }
}

/**
 * Reanálise de uma ordem JÁ GRAVADA que vai mudar (ex.: a parcela recorrente
 * que recebe a nota e segue para autorização). Confere a ordem como ficará;
 * com apontamento não confirmado, devolve-os sem mexer em nada. Senão, a
 * gravação fica com quem chamou — depois dela, `registrar` guarda o
 * resultado na ordem, como na criação.
 */
export async function reverificarOrdem(
  ordemId: string,
  mudancas: Linha,
  ctx: ContextoVerificacao & { confirmacao: Confirmacao }
): Promise<{ apontamentos?: Apontamento[]; registrar: (motivo: string) => Promise<void> }> {
  const admin = await createAdminClient()
  const { data: atual } = await admin.from("ordens_pagamento").select("*").eq("id", ordemId).maybeSingle()
  const linha = { ...((atual as Linha | null) ?? {}), ...mudancas, id: ordemId }
  const { origem, resultados } = await verificarOrdens([linha], ctx)
  const apontamentos = apontamentosDe(resultados, ctx.confirmacao)
  const registrar = async (motivo: string) => {
    const lista = resultados[0] ?? []
    if (!origem || !lista.length) return
    const emp = await tenantAtual()
    const { error } = await admin.from("ordens_pagamento_verificacoes").insert(
      lista.map((v) => ({
        emp_proprietaria_id: emp,
        ordem_id: ordemId,
        origem,
        codigo: v.codigo,
        titulo: v.titulo,
        severidade: v.severidade,
        status: v.status === "falha" ? "alerta" : v.status,
        detalhe: v.detalhe,
      }))
    )
    if (error && !esquemaAusente(error)) console.error("verificações:", error.message)
    const al = lista.filter((v) => v.status === "falha")
    await registrarEvento(
      ordemId,
      "verificada",
      await usuarioDaTrilha(),
      `${lista.length} verificação(ões) ${motivo} — ${al.length ? `${al.length} alerta(s) confirmados por quem registrou` : "sem alertas"}.`,
      { alertas: al.map((v) => v.codigo), confirmados: ctx.confirmacao.codigos }
    )
  }
  return precisaConfirmar(apontamentos) ? { apontamentos, registrar } : { registrar }
}

export type VerificacaoGravada = {
  codigo: string
  titulo: string
  severidade: string
  status: "ok" | "alerta" | "na"
  detalhe: string | null
  quando: string
}

export async function verificacoesDaOrdem(ordemId: string): Promise<VerificacaoGravada[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ordens_pagamento_verificacoes")
    .select("codigo, titulo, severidade, status, detalhe, created_at")
    .eq("ordem_id", ordemId)
    .order("created_at")
  if (error) return []
  return (data ?? []).map((v) => ({
    codigo: String(v.codigo),
    titulo: String(v.titulo),
    severidade: String(v.severidade),
    status: v.status as VerificacaoGravada["status"],
    detalhe: (v.detalhe as string | null) ?? null,
    quando: String(v.created_at),
  }))
}

/** Quantos alertas de criação cada ordem tem (para a fila de avaliação). */
export async function alertasPorOrdem(ordemIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  if (!ordemIds.length) return m
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ordens_pagamento_verificacoes")
    .select("ordem_id")
    .in("ordem_id", ordemIds)
    .eq("status", "alerta")
  if (error) return m
  for (const v of data ?? []) m.set(String(v.ordem_id), (m.get(String(v.ordem_id)) ?? 0) + 1)
  return m
}

// ── Adaptadores com o formato do cliente Supabase ───────────────────────────
// Os gatilhos trocam `admin.from("ordens_pagamento").insert(…)` por estes e
// seguem tratando `{ data, error }` como antes — o erro de bloqueio chega na
// mesma mensagem de falha que já existia.

type ErroCompat = { message: string; code?: string; apontamentos?: Apontamento[] }

/** Uma ordem: equivale a `.insert(linha).select("id").single()`. */
export async function inserirOrdemVerificada(
  linha: Linha,
  ctx: ContextoVerificacao = {}
): Promise<{ data: { id: string } | null; error: ErroCompat | null }> {
  const r = await inserirOrdensVerificadas([linha], ctx)
  if (r.erro || !r.ids?.[0]) {
    return { data: null, error: { message: r.erro ?? "Ordem não gravada.", apontamentos: r.apontamentos } }
  }
  return { data: { id: r.ids[0] }, error: null }
}

/** Várias ordens: equivale a `.insert(linhas).select("id")`. */
export async function inserirOrdensVerificadasCompat(
  linhas: Linha | Linha[],
  ctx: ContextoVerificacao = {}
): Promise<{ data: { id: string }[] | null; error: ErroCompat | null }> {
  const r = await inserirOrdensVerificadas(Array.isArray(linhas) ? linhas : [linhas], ctx)
  if (r.erro || !r.ids) {
    return { data: null, error: { message: r.erro ?? "Ordens não gravadas.", apontamentos: r.apontamentos } }
  }
  return { data: r.ids.map((id) => ({ id })), error: null }
}
