import "server-only"

import { bancoPorCodigo, codigoPorNome } from "@/lib/cnab/bancos"
import { codigoDeBarrasDe, gerarRemessa240, lerRetorno240, type ContaRemessa, type ItemRemessa } from "@/lib/cnab/febraban240"
import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { registrarEvento, SITUACAO_A_PAGAR } from "@/lib/db/ordens-ciclo"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { emitirEvento } from "@/lib/db/webhooks"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * REMESSA DE PAGAMENTO (onda 5, A2). A entidade cadastra a conta de onde
 * paga; as ordens "A pagar" marcadas viram um CNAB 240 (lib/cnab) guardado
 * em `financeiro_remessas.conteudo`, uma por item. O retorno do banco marca
 * cada item pago (ordem vira "Paga" com data e valor do banco) ou rejeitado
 * (ordem continua "A pagar", com o motivo no histórico). A ordem não ganha
 * situação nova: "em remessa" é ter item ativo numa remessa não cancelada.
 * Tabelas em supabase/financeiro-remessas.sql; sem elas, `disponivel: false`.
 */

export type ContaBancaria = {
  id: string
  apelido: string
  bancoCodigo: string
  bancoNome: string | null
  agencia: string
  agenciaDv: string | null
  conta: string
  contaDv: string | null
  tipoConta: string
  convenio: string | null
  versaoArquivo: string | null
  versaoLote: string | null
  titularNome: string | null
  titularDocumento: string | null
  pixChave: string | null
  centroCustoId: string | null
  sequenciaRemessa: number
  ativa: boolean
}

export type DadosConta = Omit<ContaBancaria, "id" | "sequenciaRemessa">

export type RemessaLinha = {
  id: string
  contaId: string
  contaApelido: string
  numero: number
  arquivoNome: string
  totalItens: number
  totalValor: number
  situacao: "gerada" | "enviada" | "retornada" | "cancelada"
  geradaEm: string
  retornoEm: string | null
  retornoResumo: { pagos: number; rejeitados: number; naoEncontrados: number } | null
}

export type ItemLinha = {
  id: string
  ordemId: string
  ordemCodigo: string | null
  seq: number
  segmento: "A" | "J"
  formaLancamento: string
  favorecidoNome: string | null
  favorecidoDocumento: string | null
  destino: string
  valor: number
  dataPagamento: string
  situacao: "enviado" | "pago" | "rejeitado" | "cancelado"
  ocorrencia: string | null
  ocorrenciaDescricao: string | null
  retornoValor: number | null
  retornoData: string | null
}

/** Ordem "A pagar" vista pela remessa: pronta ou com o que falta. */
export type OrdemParaRemessa = {
  id: string
  codigo: string | null
  descricao: string | null
  tipo: string | null
  valor: number
  vencimento: string | null
  forma: string | null
  favorecidoNome: string | null
  favorecidoDocumento: string | null
  /** Como vai sair: Pix, crédito em conta/TED ou boleto. */
  meio: "pix" | "conta" | "boleto" | null
  destino: string | null
  /** Em remessa ativa (não entra de novo). */
  emRemessa: { remessaId: string; numero: number } | null
  pendencias: string[]
  item: ItemRemessa | null
}

const ROTULO_FORMA: Record<string, string> = {
  "01": "Crédito em conta (mesmo banco)",
  "03": "TED/DOC",
  "05": "Crédito em poupança (mesmo banco)",
  "30": "Boleto (mesmo banco)",
  "31": "Boleto (outro banco)",
  "45": "Pix",
}
export function rotuloForma(f: string): string {
  return ROTULO_FORMA[f] ?? `Forma ${f}`
}

function montarConta(c: Record<string, unknown>): ContaBancaria {
  return {
    id: String(c.id),
    apelido: String(c.apelido),
    bancoCodigo: String(c.banco_codigo),
    bancoNome: texto(c.banco_nome),
    agencia: String(c.agencia),
    agenciaDv: texto(c.agencia_dv),
    conta: String(c.conta),
    contaDv: texto(c.conta_dv),
    tipoConta: String(c.tipo_conta ?? "corrente"),
    convenio: texto(c.convenio),
    versaoArquivo: texto(c.layout_versao_arquivo),
    versaoLote: texto(c.layout_versao_lote),
    titularNome: texto(c.titular_nome),
    titularDocumento: texto(c.titular_documento),
    pixChave: texto(c.pix_chave),
    centroCustoId: texto(c.centro_custo_id),
    sequenciaRemessa: Number(c.sequencia_remessa ?? 0),
    ativa: c.ativa !== false,
  }
}

// ── Contas ───────────────────────────────────────────────────────────────────

export async function listarContasBancarias(): Promise<{ disponivel: boolean; contas: ContaBancaria[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin.from("financeiro_contas_bancarias").select("*").eq("emp_proprietaria_id", await tenantAtual()).order("ativa", { ascending: false }).order("apelido")
  if (error) return { disponivel: !esquemaAusente(error), contas: [] }
  return { disponivel: true, contas: (data ?? []).map((c) => montarConta(c as Record<string, unknown>)) }
}

export async function obterContaBancaria(id: string): Promise<ContaBancaria | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("financeiro_contas_bancarias").select("*").eq("id", id).eq("emp_proprietaria_id", await tenantAtual()).maybeSingle()
  return data ? montarConta(data as Record<string, unknown>) : null
}

export async function salvarContaBancaria(id: string | null, d: DadosConta): Promise<{ id?: string; erro?: string; campo?: string }> {
  if (!d.apelido.trim()) return { erro: "Dê um nome à conta (ex.: BB corrente).", campo: "apelido" }
  const banco = d.bancoCodigo.replace(/\D/g, "").padStart(3, "0")
  if (!/^\d{3}$/.test(banco) || banco === "000") return { erro: "Informe o código do banco com 3 dígitos.", campo: "banco_codigo" }
  if (!d.agencia.replace(/\D/g, "")) return { erro: "Informe a agência.", campo: "agencia" }
  if (!d.conta.replace(/\D/g, "")) return { erro: "Informe a conta.", campo: "conta" }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linha = {
    emp_proprietaria_id: emp,
    apelido: d.apelido.trim().slice(0, 60),
    banco_codigo: banco,
    banco_nome: d.bancoNome?.trim() || bancoPorCodigo(banco)?.nome || null,
    agencia: d.agencia.replace(/\D/g, ""),
    agencia_dv: d.agenciaDv?.trim().slice(0, 1) || null,
    conta: d.conta.replace(/\D/g, ""),
    conta_dv: d.contaDv?.trim().slice(0, 1) || null,
    tipo_conta: d.tipoConta === "poupanca" ? "poupanca" : "corrente",
    convenio: d.convenio?.trim() || null,
    layout_versao_arquivo: d.versaoArquivo?.replace(/\D/g, "").slice(0, 3) || null,
    layout_versao_lote: d.versaoLote?.replace(/\D/g, "").slice(0, 3) || null,
    titular_nome: d.titularNome?.trim() || null,
    titular_documento: d.titularDocumento?.replace(/\D/g, "") || null,
    pix_chave: d.pixChave?.trim() || null,
    centro_custo_id: d.centroCustoId || null,
    ativa: d.ativa,
    updated_at: new Date().toISOString(),
  }
  const r = id
    ? await admin.from("financeiro_contas_bancarias").update(linha).eq("id", id).eq("emp_proprietaria_id", emp).select("id").single()
    : await admin.from("financeiro_contas_bancarias").insert(linha).select("id").single()
  if (r.error) {
    if (esquemaAusente(r.error)) return { erro: "Falta rodar o SQL supabase/financeiro-remessas.sql." }
    return { erro: `Não foi possível salvar: ${r.error.message}` }
  }
  return { id: String(r.data.id) }
}

// ── Ordens prontas para remessa ──────────────────────────────────────────────

/** CPF/CNPJ só com dígitos; telefone no formato +55DDDNÚMERO; e-mail e aleatória como estão. */
function chavePixNormalizada(bruta: string): string {
  const t = bruta.trim()
  if (/@/.test(t) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) return t
  const d = t.replace(/\D/g, "")
  if (d.length === 11 || d.length === 14) {
    // 11 dígitos: CPF, salvo se vier com "+" ou "(" (telefone).
    if (d.length === 11 && /^\s*(\+|\()/.test(t)) return `+55${d}`
    return d
  }
  if (d.length === 12 || d.length === 13) return `+${d.startsWith("55") ? d : `55${d}`}`
  return t
}

function documentoLimpo(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "")
  return d.length === 11 || d.length === 14 ? d : null
}

function separarDv(v: string | null | undefined): { numero: string; dv: string | null } {
  const t = (v ?? "").trim()
  const m = /^([\d.]+)-?([\dxX])$/.exec(t)
  if (m && t.includes("-")) return { numero: m[1].replace(/\D/g, ""), dv: m[2].toUpperCase() }
  return { numero: t.replace(/\D/g, ""), dv: null }
}

export async function ordensParaRemessa(): Promise<{ disponivel: boolean; ordens: OrdemParaRemessa[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: brutas, error } = await admin
    .from("ordens_pagamento")
    .select(
      "id, codigo, descricao, tipo, forma_pagamento, valor_inicial_cobranca, vencimento, fornecedor_id, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso, beneficiario_doc_avulso, dados_bancarios_id, pix_codigo, arquivo_boleto, boleto_linha_digitavel, caixa_conta_id, cartao_id"
    )
    .eq("emp_proprietaria_id", emp)
    .eq("situacao", SITUACAO_A_PAGAR)
    .not("excluido", "is", true)
    .order("vencimento", { ascending: true, nullsFirst: false })
    .limit(500)
  if (error) {
    if (error.code === "42703" || esquemaAusente(error)) return { disponivel: false, ordens: [] }
    throw new Error(error.message)
  }
  const lista = (brutas ?? []) as Record<string, unknown>[]
  if (lista.length === 0) return { disponivel: true, ordens: [] }

  // Itens ativos de remessa (gerada/enviada) → "em remessa".
  const { data: itens } = await admin
    .from("financeiro_remessa_itens")
    .select("ordem_id, situacao, remessa:remessa_id (id, numero, situacao)")
    .in("ordem_id", lista.map((o) => String(o.id)))
    .in("situacao", ["enviado", "pago"])
  const emRemessa = new Map<string, { remessaId: string; numero: number }>()
  for (const i of itens ?? []) {
    const r = (Array.isArray(i.remessa) ? i.remessa[0] : i.remessa) as { id: string; numero: number; situacao: string } | null
    if (r && r.situacao !== "cancelada") emRemessa.set(String(i.ordem_id), { remessaId: String(r.id), numero: Number(r.numero) })
  }

  // Favorecidos e meios de pagamento.
  const empIds = [...new Set(lista.flatMap((o) => [o.beneficiario_fornecedor_id, o.fornecedor_id]).filter((v): v is string => !!v))]
  const usuIds = [...new Set(lista.map((o) => o.beneficiario_usuario_id).filter((v): v is string => !!v))]
  const dbIds = [...new Set(lista.map((o) => o.dados_bancarios_id).filter((v): v is string => !!v))]
  const [empresas, usuarios, dados] = await Promise.all([
    empIds.length ? admin.from("empresa").select("id, empresa, nome_fantasia, nome_razao, cnpj_cpf").in("id", empIds) : Promise.resolve({ data: [] }),
    usuIds.length ? admin.from("usuarios").select("id, nome_completo, nome_guerra, cpf").in("id", usuIds) : Promise.resolve({ data: [] }),
    dbIds.length ? admin.from("dados_bancarios").select("id, banco, banco_codigo, agencia, conta, tipo_conta, pix, pix_tipo, favorecido, fornecedor_id, usuario_id").in("id", dbIds) : Promise.resolve({ data: [] }),
  ])
  const empresaPorId = new Map((empresas.data ?? []).map((e) => [String(e.id), e]))
  const usuarioPorId = new Map((usuarios.data ?? []).map((u) => [String(u.id), u]))
  const dadosPorId = new Map((dados.data ?? []).map((d) => [String(d.id), d]))
  // Meios cadastrados do fornecedor/usuário, para sugerir quando a ordem não escolheu um.
  const { data: meiosTodos } = await admin
    .from("dados_bancarios")
    .select("id, banco, banco_codigo, agencia, conta, tipo_conta, pix, pix_tipo, favorecido, fornecedor_id, usuario_id, favorito, prefere_pix")
    .or([empIds.length ? `fornecedor_id.in.(${empIds.join(",")})` : null, usuIds.length ? `usuario_id.in.(${usuIds.join(",")})` : null].filter(Boolean).join(","))
    .limit(2000)
    .then((r) => r, () => ({ data: [] as Record<string, unknown>[] }))
  const meiosPorDono = new Map<string, Record<string, unknown>[]>()
  for (const m of (meiosTodos ?? []) as Record<string, unknown>[]) {
    const dono = texto(m.fornecedor_id) ?? texto(m.usuario_id)
    if (!dono) continue
    meiosPorDono.set(dono, [...(meiosPorDono.get(dono) ?? []), m])
  }

  const ordens: OrdemParaRemessa[] = lista.map((o) => {
    const id = String(o.id)
    const codigo = texto(o.codigo)
    const valor = Number(o.valor_inicial_cobranca ?? 0)
    const pendencias: string[] = []
    const empresa = empresaPorId.get(texto(o.beneficiario_fornecedor_id) ?? "") ?? empresaPorId.get(texto(o.fornecedor_id) ?? "")
    const usuario = usuarioPorId.get(texto(o.beneficiario_usuario_id) ?? "")
    const favorecidoNome = (empresa && (texto(empresa.empresa) ?? texto(empresa.nome_fantasia) ?? texto(empresa.nome_razao))) ?? (usuario && (texto(usuario.nome_completo) ?? texto(usuario.nome_guerra))) ?? texto(o.beneficiario_nome_avulso)
    const favorecidoDocumento = documentoLimpo(texto(empresa?.cnpj_cpf) ?? texto(usuario?.cpf) ?? texto(o.beneficiario_doc_avulso))
    if (valor <= 0) pendencias.push("sem valor")
    if (o.caixa_conta_id) pendencias.push("paga pelo caixa (dinheiro)")
    if (o.cartao_id) pendencias.push("paga com cartão")
    if (!favorecidoNome) pendencias.push("sem favorecido")
    if (!favorecidoDocumento) pendencias.push("favorecido sem CPF/CNPJ")

    // Meio: boleto > chave Pix da ordem > conta/Pix escolhido na ordem > cadastro do favorecido.
    let meio: OrdemParaRemessa["meio"] = null
    let destino: string | null = null
    let item: ItemRemessa | null = null
    const forma = texto(o.forma_pagamento)
    const dataPagamento = (() => {
      const v = texto(o.vencimento)?.slice(0, 10) ?? null
      const hoje = hojeSP()
      return v && v > hoje ? v : hoje
    })()
    const base = { seuNumero: (codigo ?? id).slice(0, 20), favorecidoNome: favorecidoNome ?? "", favorecidoDocumento: favorecidoDocumento ?? "", valor, dataPagamento, descricao: texto(o.descricao)?.slice(0, 40) ?? null }
    const linhaBoleto = texto(o.boleto_linha_digitavel)
    const dono = texto(o.beneficiario_fornecedor_id) ?? texto(o.fornecedor_id) ?? texto(o.beneficiario_usuario_id)
    const meiosDoDono = dono ? (meiosPorDono.get(dono) ?? []) : []
    const escolhido = texto(o.dados_bancarios_id) ? (dadosPorId.get(String(o.dados_bancarios_id)) as Record<string, unknown> | undefined) : undefined

    if (forma === "Boleto" || linhaBoleto || o.arquivo_boleto) {
      meio = "boleto"
      const cb = linhaBoleto ? codigoDeBarrasDe(linhaBoleto) : null
      if (!cb) pendencias.push(linhaBoleto ? "linha digitável do boleto inválida" : "falta a linha digitável do boleto")
      else {
        destino = `Boleto ${cb.slice(0, 3)}…${cb.slice(-4)}`
        item = { ...base, tipo: "boleto", codigoBarras: cb, vencimento: texto(o.vencimento)?.slice(0, 10) ?? null, beneficiarioNome: favorecidoNome }
      }
    } else {
      const candidatos = [escolhido, ...meiosDoDono.filter((m) => m !== escolhido)].filter((m): m is Record<string, unknown> => !!m)
      const comPix = candidatos.find((m) => texto(m.pix))
      const comConta = candidatos.find((m) => texto(m.conta) && (texto(m.banco_codigo) || codigoPorNome(texto(m.banco))))
      const prefereConta = forma === "Depósito bancário (TED)"
      const usar = prefereConta ? (comConta ?? comPix) : (comPix ?? comConta)
      if (!usar) pendencias.push(forma === "Pix (QR Code)" && texto(o.pix_codigo) ? "Pix por QR Code não entra na remessa — pague pelo app do banco" : "favorecido sem chave Pix nem conta bancária cadastrada")
      else if (usar === comPix && !(prefereConta && comConta)) {
        meio = "pix"
        const chave = chavePixNormalizada(String(usar.pix))
        destino = `Pix ${chave}`
        item = { ...base, tipo: "pix", chave }
      } else {
        meio = "conta"
        const bancoCodigo = texto(usar.banco_codigo) ?? codigoPorNome(texto(usar.banco))
        const ag = separarDv(texto(usar.agencia))
        const ct = separarDv(texto(usar.conta))
        if (!bancoCodigo) pendencias.push(`banco "${texto(usar.banco) ?? "?"}" sem código conhecido`)
        else {
          destino = `${bancoPorCodigo(bancoCodigo)?.nome ?? `Banco ${bancoCodigo}`} ag. ${ag.numero}${ag.dv ? `-${ag.dv}` : ""} c/c ${ct.numero}${ct.dv ? `-${ct.dv}` : ""}`
          item = { ...base, tipo: "conta", bancoCodigo, agencia: ag.numero, agenciaDv: ag.dv, conta: ct.numero, contaDv: ct.dv, tipoConta: String(usar.tipo_conta ?? "corrente").toLowerCase().includes("poup") ? "poupanca" : "corrente" }
        }
      }
    }
    if (pendencias.length) item = null
    return {
      id,
      codigo,
      descricao: texto(o.descricao),
      tipo: texto(o.tipo),
      valor,
      vencimento: texto(o.vencimento)?.slice(0, 10) ?? null,
      forma,
      favorecidoNome,
      favorecidoDocumento,
      meio,
      destino,
      emRemessa: emRemessa.get(id) ?? null,
      pendencias,
      item,
    }
  })
  return { disponivel: true, ordens }
}

/** Linha digitável do boleto gravada na ordem (para a remessa). */
export async function definirLinhaDigitavel(ordemId: string, linha: string | null): Promise<{ erro?: string }> {
  if (linha && !codigoDeBarrasDe(linha)) return { erro: "Linha digitável inválida: precisa ter 47 dígitos (ou 44 do código de barras)." }
  const admin = await createAdminClient()
  const { error } = await admin.from("ordens_pagamento").update({ boleto_linha_digitavel: linha ? linha.replace(/\D/g, "") : null }).eq("id", ordemId).eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: error.message } : {}
}

// ── Gerar ────────────────────────────────────────────────────────────────────

export async function gerarRemessa(contaId: string, ordemIds: string[], usuarioId: string): Promise<{ remessaId?: string; erro?: string }> {
  const conta = await obterContaBancaria(contaId)
  if (!conta) return { erro: "Conta bancária não encontrada." }
  if (!conta.ativa) return { erro: "Esta conta está desativada." }
  const org = await obterOrganizacao()
  const titularNome = conta.titularNome ?? org?.nomeRazao ?? org?.nomeFantasia ?? ""
  const titularDocumento = conta.titularDocumento ?? documentoLimpo(org?.cnpjCpf) ?? ""
  if (!titularNome || !titularDocumento) return { erro: "Informe o nome e o CNPJ do titular na conta bancária (ou no cadastro da entidade)." }

  const { ordens } = await ordensParaRemessa()
  const escolhidas = ordens.filter((o) => ordemIds.includes(o.id))
  if (escolhidas.length === 0) return { erro: "Marque ao menos uma ordem." }
  const comProblema = escolhidas.filter((o) => !o.item || o.emRemessa)
  if (comProblema.length) return { erro: `${comProblema.length} ordem(ns) não pode(m) entrar: ${comProblema.map((o) => `${o.codigo ?? o.id.slice(0, 8)} (${o.emRemessa ? `já na remessa ${o.emRemessa.numero}` : o.pendencias.join(", ")})`).join("; ")}` }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const numero = conta.sequenciaRemessa + 1
  const contaRemessa: ContaRemessa = {
    bancoCodigo: conta.bancoCodigo,
    agencia: conta.agencia,
    agenciaDv: conta.agenciaDv,
    conta: conta.conta,
    contaDv: conta.contaDv,
    tipoConta: conta.tipoConta,
    convenio: conta.convenio,
    titularNome,
    titularDocumento,
    versaoArquivo: conta.versaoArquivo,
    versaoLote: conta.versaoLote,
  }
  let arquivo
  try {
    arquivo = gerarRemessa240({ conta: contaRemessa, numeroRemessa: numero, itens: escolhidas.map((o) => o.item as ItemRemessa) })
  } catch (e) {
    return { erro: `Não foi possível montar o arquivo: ${(e as Error).message}` }
  }
  const hoje = hojeSP().replace(/-/g, "")
  const arquivoNome = `REM${conta.bancoCodigo}_${hoje}_${String(numero).padStart(6, "0")}.rem`
  const { data: criada, error } = await admin
    .from("financeiro_remessas")
    .insert({ emp_proprietaria_id: emp, conta_bancaria_id: conta.id, numero, arquivo_nome: arquivoNome, conteudo: arquivo.conteudo, total_itens: escolhidas.length, total_valor: arquivo.totalValor, situacao: "gerada", gerada_por: usuarioId })
    .select("id")
    .single()
  if (error || !criada) return { erro: `Não foi possível gravar a remessa: ${error?.message ?? "?"}` }
  const remessaId = String(criada.id)
  await admin.from("financeiro_contas_bancarias").update({ sequencia_remessa: numero, updated_at: new Date().toISOString() }).eq("id", conta.id)
  const itens = escolhidas.map((o, i) => {
    const it = o.item as ItemRemessa
    return {
      emp_proprietaria_id: emp,
      remessa_id: remessaId,
      ordem_id: o.id,
      seq: i + 1,
      segmento: it.tipo === "boleto" ? "J" : "A",
      forma_lancamento: it.tipo === "pix" ? "45" : it.tipo === "boleto" ? (it.codigoBarras.slice(0, 3) === conta.bancoCodigo ? "30" : "31") : it.bancoCodigo === conta.bancoCodigo ? (it.tipoConta === "poupanca" ? "05" : "01") : "03",
      favorecido_nome: it.favorecidoNome,
      favorecido_documento: it.favorecidoDocumento,
      banco_codigo: it.tipo === "conta" ? it.bancoCodigo : null,
      agencia: it.tipo === "conta" ? `${it.agencia}${it.agenciaDv ? `-${it.agenciaDv}` : ""}` : null,
      conta: it.tipo === "conta" ? `${it.conta}${it.contaDv ? `-${it.contaDv}` : ""}` : null,
      pix_chave: it.tipo === "pix" ? it.chave : null,
      codigo_barras: it.tipo === "boleto" ? it.codigoBarras : null,
      valor: it.valor,
      data_pagamento: it.dataPagamento,
    }
  })
  const { error: e2 } = await admin.from("financeiro_remessa_itens").insert(itens)
  if (e2) {
    await admin.from("financeiro_remessas").delete().eq("id", remessaId)
    return { erro: `Não foi possível gravar os itens: ${e2.message}` }
  }
  await registrarEvento(escolhidas.map((o) => o.id), "em_remessa", usuarioId, `Incluída na remessa ${numero} (${arquivoNome}) da conta ${conta.apelido}.`, { remessa_id: remessaId, numero }).catch(() => undefined)
  return { remessaId }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listarRemessas(): Promise<{ disponivel: boolean; remessas: RemessaLinha[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_remessas")
    .select("id, conta_bancaria_id, numero, arquivo_nome, total_itens, total_valor, situacao, created_at, retorno_em, retorno_resumo, conta:conta_bancaria_id (apelido)")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) return { disponivel: !esquemaAusente(error), remessas: [] }
  return {
    disponivel: true,
    remessas: (data ?? []).map((r) => {
      const conta = (Array.isArray(r.conta) ? r.conta[0] : r.conta) as { apelido?: string } | null
      return {
        id: String(r.id),
        contaId: String(r.conta_bancaria_id),
        contaApelido: conta?.apelido ?? "conta",
        numero: Number(r.numero),
        arquivoNome: String(r.arquivo_nome),
        totalItens: Number(r.total_itens ?? 0),
        totalValor: Number(r.total_valor ?? 0),
        situacao: r.situacao as RemessaLinha["situacao"],
        geradaEm: String(r.created_at),
        retornoEm: texto(r.retorno_em),
        retornoResumo: (r.retorno_resumo as RemessaLinha["retornoResumo"]) ?? null,
      }
    }),
  }
}

export async function obterRemessa(id: string): Promise<{ remessa: RemessaLinha & { conteudo: string; retornoNome: string | null }; itens: ItemLinha[] } | null> {
  const admin = await createAdminClient()
  const { data: r } = await admin
    .from("financeiro_remessas")
    .select("*, conta:conta_bancaria_id (apelido)")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!r) return null
  const { data: itens } = await admin.from("financeiro_remessa_itens").select("*, ordem:ordem_id (codigo)").eq("remessa_id", id).order("seq")
  const conta = (Array.isArray(r.conta) ? r.conta[0] : r.conta) as { apelido?: string } | null
  return {
    remessa: {
      id: String(r.id),
      contaId: String(r.conta_bancaria_id),
      contaApelido: conta?.apelido ?? "conta",
      numero: Number(r.numero),
      arquivoNome: String(r.arquivo_nome),
      totalItens: Number(r.total_itens ?? 0),
      totalValor: Number(r.total_valor ?? 0),
      situacao: r.situacao as RemessaLinha["situacao"],
      geradaEm: String(r.created_at),
      retornoEm: texto(r.retorno_em),
      retornoResumo: (r.retorno_resumo as RemessaLinha["retornoResumo"]) ?? null,
      conteudo: String(r.conteudo),
      retornoNome: texto(r.retorno_nome),
    },
    itens: (itens ?? []).map((i) => {
      const ordem = (Array.isArray(i.ordem) ? i.ordem[0] : i.ordem) as { codigo?: string | null } | null
      return {
        id: String(i.id),
        ordemId: String(i.ordem_id),
        ordemCodigo: ordem?.codigo ?? null,
        seq: Number(i.seq),
        segmento: i.segmento as "A" | "J",
        formaLancamento: String(i.forma_lancamento),
        favorecidoNome: texto(i.favorecido_nome),
        favorecidoDocumento: texto(i.favorecido_documento),
        destino: texto(i.pix_chave) ? `Pix ${i.pix_chave}` : texto(i.codigo_barras) ? `Boleto …${String(i.codigo_barras).slice(-6)}` : `${bancoPorCodigo(texto(i.banco_codigo))?.nome ?? `Banco ${i.banco_codigo ?? "?"}`} ag. ${i.agencia ?? "?"} c/c ${i.conta ?? "?"}`,
        valor: Number(i.valor),
        dataPagamento: String(i.data_pagamento).slice(0, 10),
        situacao: i.situacao as ItemLinha["situacao"],
        ocorrencia: texto(i.ocorrencia),
        ocorrenciaDescricao: texto(i.ocorrencia_descricao),
        retornoValor: i.retorno_valor === null || i.retorno_valor === undefined ? null : Number(i.retorno_valor),
        retornoData: texto(i.retorno_data)?.slice(0, 10) ?? null,
      }
    }),
  }
}

export async function marcarRemessaEnviada(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("financeiro_remessas").update({ situacao: "enviada", enviada_em: new Date().toISOString() }).eq("id", id).eq("emp_proprietaria_id", await tenantAtual()).eq("situacao", "gerada")
  return error ? { erro: error.message } : {}
}

/** Cancela uma remessa ainda sem retorno: as ordens voltam a ficar disponíveis. */
export async function cancelarRemessa(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const r = await obterRemessa(id)
  if (!r) return { erro: "Remessa não encontrada." }
  if (r.remessa.situacao === "retornada") return { erro: "Esta remessa já teve retorno — não dá para cancelar." }
  if (r.remessa.situacao === "cancelada") return { erro: "Já cancelada." }
  const admin = await createAdminClient()
  await admin.from("financeiro_remessa_itens").update({ situacao: "cancelado" }).eq("remessa_id", id).eq("situacao", "enviado")
  const { error } = await admin.from("financeiro_remessas").update({ situacao: "cancelada" }).eq("id", id)
  if (error) return { erro: error.message }
  await registrarEvento(r.itens.map((i) => i.ordemId), "remessa_cancelada", usuarioId, `Remessa ${r.remessa.numero} cancelada — a ordem volta a aguardar pagamento.`, { remessa_id: id }).catch(() => undefined)
  return {}
}

// ── Retorno ──────────────────────────────────────────────────────────────────

export async function processarRetorno(p: { remessaId: string; arquivo: File; usuarioId: string }): Promise<{ pagos?: number; rejeitados?: number; naoEncontrados?: number; avisos?: string[]; erro?: string }> {
  const r = await obterRemessa(p.remessaId)
  if (!r) return { erro: "Remessa não encontrada." }
  if (r.remessa.situacao === "cancelada") return { erro: "Remessa cancelada não recebe retorno." }
  if (p.arquivo.size === 0 || p.arquivo.size > 4 * 1024 * 1024) return { erro: "Escolha o arquivo de retorno (até 4 MB)." }
  const bytes = new Uint8Array(await p.arquivo.arrayBuffer())
  let textoRet = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  if (textoRet.includes("�")) textoRet = new TextDecoder("windows-1252").decode(bytes)
  const lido = lerRetorno240(textoRet)
  if (lido.ocorrencias.length === 0) return { erro: "O arquivo não tem registros de detalhe (segmentos A/J) de 240 colunas. Confira se é o retorno CNAB 240 de pagamentos." }

  const conta = await obterContaBancaria(r.remessa.contaId)
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const porSeuNumero = new Map(r.itens.map((i) => [(i.ordemCodigo ?? i.ordemId).slice(0, 20).trim(), i]))
  let pagos = 0
  let rejeitados = 0
  let naoEncontrados = 0
  const avisos: string[] = [...lido.lotesRejeitados.map((l) => `Lote ${l}`)]
  const agora = new Date().toISOString()
  for (const oc of lido.ocorrencias) {
    const item = porSeuNumero.get(oc.seuNumero.trim())
    if (!item) {
      naoEncontrados++
      continue
    }
    if (item.situacao === "pago") continue // retorno reimportado
    if (oc.pago) {
      const valorPago = oc.valorReal ?? item.valor
      const dataPagamento = oc.dataReal ?? item.dataPagamento
      const { error } = await admin
        .from("ordens_pagamento")
        .update({ situacao: "Paga", valor_pago: valorPago, data_pagamento: dataPagamento, pagador_id: p.usuarioId, ...(conta?.centroCustoId ? { centro_custo_receita_id: conta.centroCustoId } : {}) })
        .eq("id", item.ordemId)
        .eq("emp_proprietaria_id", emp)
        .in("situacao", [SITUACAO_A_PAGAR, "Paga"])
      if (error) {
        avisos.push(`${oc.seuNumero}: não foi possível marcar paga (${error.message})`)
        continue
      }
      await admin.from("financeiro_remessa_itens").update({ situacao: "pago", ocorrencia: oc.codigos.join(""), ocorrencia_descricao: oc.descricao, retorno_valor: valorPago, retorno_data: dataPagamento }).eq("id", item.id)
      await registrarEvento(item.ordemId, "paga", p.usuarioId, `Paga pelo banco (retorno da remessa ${r.remessa.numero}): ${oc.descricao}.`, { remessa_id: p.remessaId, valor_pago: valorPago, data_pagamento: dataPagamento }).catch(() => undefined)
      pagos++
    } else {
      await admin.from("financeiro_remessa_itens").update({ situacao: "rejeitado", ocorrencia: oc.codigos.join(""), ocorrencia_descricao: oc.descricao }).eq("id", item.id)
      await registrarEvento(item.ordemId, "remessa_rejeitada", p.usuarioId, `Rejeitada pelo banco na remessa ${r.remessa.numero}: ${oc.descricao}. A ordem continua a pagar.`, { remessa_id: p.remessaId, ocorrencia: oc.codigos }).catch(() => undefined)
      rejeitados++
    }
  }
  await admin
    .from("financeiro_remessas")
    .update({ situacao: "retornada", retorno_nome: p.arquivo.name.slice(0, 160), retorno_conteudo: textoRet.slice(0, 2_000_000), retorno_em: agora, retorno_por: p.usuarioId, retorno_resumo: { pagos, rejeitados, naoEncontrados } })
    .eq("id", p.remessaId)
  void emitirEvento("remessa.retornada", { remessaId: p.remessaId, numero: r.remessa.numero, conta: r.remessa.contaApelido, pagos, rejeitados, naoEncontrados })
  return { pagos, rejeitados, naoEncontrados, avisos }
}

/** Remessa ativa de uma ordem (para a tela da ordem avisar "em remessa"). */
export async function remessaDaOrdem(ordemId: string): Promise<{ remessaId: string; numero: number; situacao: string } | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin.from("financeiro_remessa_itens").select("situacao, remessa:remessa_id (id, numero, situacao)").eq("ordem_id", ordemId).in("situacao", ["enviado", "pago", "rejeitado"]).order("created_at", { ascending: false }).limit(1)
  if (error || !data?.length) return null
  const r = (Array.isArray(data[0].remessa) ? data[0].remessa[0] : data[0].remessa) as { id: string; numero: number; situacao: string } | null
  if (!r || r.situacao === "cancelada") return null
  return { remessaId: String(r.id), numero: Number(r.numero), situacao: String(data[0].situacao) }
}
