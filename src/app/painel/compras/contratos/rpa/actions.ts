"use server"

import { inserirOrdemVerificada } from "@/lib/db/ordens-verificacao"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { esquemaAusente } from "@/lib/db/comum"
import {
  gerarCodigoProcesso,
  listarCentrosCustoParaCompra,
  listarDepartamentos,
  subirComprovanteCompras,
} from "@/lib/db/compras"
import {
  meiosPagamentoFornecedor,
  type ContaFornecedor,
  type PixFornecedor,
} from "@/lib/db/compras-pagamento"
import { lerDetalhePagamento } from "@/lib/db/compras-pagamento-form"
import {
  AVISO_SQL_RPA_ASSINATURA,
  AVISO_SQL_RPA_CONTRATO,
  buscarRpa,
  contratoDoRpa,
  obterConfigRpa,
  prestadorDoRpa,
  proximoNumeroRpa,
} from "@/lib/db/compras-rpa"
import { registrarEvento, usuarioDaTrilha } from "@/lib/db/ordens-ciclo"
import {
  calcularPorBruto,
  calcularPorLiquido,
  FORMAS_PAGAMENTO_RPA,
  TIPO_ORDEM_RPA,
  type FormaPagamentoRpa,
  type OpcoesRpa,
} from "@/lib/rpa-calculo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Aquisição › Contratos › RPA — escrita. Emissão exige a permissão de EDIÇÃO de
 * contratos; a lista/consulta usa a de visualização (nas páginas).
 */

async function exigirEdicao() {
  return requirePermissao("aquisicoes_contratos_edicao")
}

function txt(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? "").trim()
  return v === "" ? null : v
}
function num(fd: FormData, campo: string): number | null {
  const v = txt(fd, campo)
  if (v === null) return null
  const n = Number(v.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}
/** Número decimal "solto" (aceita 8157.41 ou 8.157,41). */
function numSolto(fd: FormData, campo: string): number | null {
  const v = txt(fd, campo)
  if (v === null) return null
  const semMilhar = /,/.test(v) ? v.replace(/\./g, "").replace(",", ".") : v
  const n = Number(semMilhar)
  return Number.isFinite(n) ? n : null
}

/**
 * Chaves Pix e contas do prestador, para o "para onde" da ordem do RPA. Própria
 * do RPA: quem emite (edição de contratos) pode não ter a permissão de compra
 * direta que a busca da aquisição direta exige. O fornecedor precisa ser do
 * tenant (conferido em meiosPagamentoFornecedor).
 */
export async function meiosDoPrestadorRpa(
  fornecedorId: string
): Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }> {
  await exigirEdicao()
  if (!fornecedorId) return { pix: [], contas: [] }
  return meiosPagamentoFornecedor(fornecedorId)
}

/** De onde vêm o prestador e a classificação da despesa da ordem do líquido. */
type OrigemRpa = {
  contratoId: string | null
  fornecedorId: string
  departamentoId: string | null
  centroCustoId: string | null
}

/**
 * RPA de contrato: o prestador é o fornecedor do contrato (pessoa física) e a
 * ordem leva o departamento e o centro de custo dele.
 */
async function origemDoContrato(
  fd: FormData
): Promise<{ origem?: OrigemRpa; erro?: string }> {
  const contrato = await contratoDoRpa(txt(fd, "contrato_id") ?? "")
  if (!contrato) return { erro: "Contrato não encontrado — escolha o contrato de novo." }
  if (!contrato.fornecedorId) {
    return { erro: "O contrato não tem fornecedor. Defina o prestador no contrato antes de emitir o RPA." }
  }
  if (contrato.fornecedorPessoaJuridica) {
    return { erro: "O fornecedor deste contrato é pessoa jurídica — RPA é só para autônomo (pessoa física)." }
  }
  return {
    origem: {
      contratoId: contrato.id,
      fornecedorId: contrato.fornecedorId,
      departamentoId: contrato.departamentoId,
      centroCustoId: contrato.centroCustoId,
    },
  }
}

/**
 * RPA AVULSO: sem contrato. O prestador é escolhido entre os fornecedores
 * pessoa física (CPF) e quem emite informa o departamento e o centro de custo
 * que o contrato daria.
 */
async function origemAvulsa(
  fd: FormData
): Promise<{ origem?: OrigemRpa; erro?: string }> {
  const prestador = await prestadorDoRpa(txt(fd, "fornecedor_id") ?? "")
  if (!prestador) return { erro: "Escolha o prestador do RPA." }
  if (!prestador.pessoaFisica) {
    return {
      erro: `${prestador.nome} não tem CPF no cadastro — RPA é só para autônomo (pessoa física). Corrija o documento em Fornecedores.`,
    }
  }
  if (prestador.bloqueado) {
    return { erro: `${prestador.nome} está bloqueado como fornecedor.` }
  }
  const departamentoId = txt(fd, "departamento_id")
  const centroCustoId = txt(fd, "centro_custo_id")
  if (!departamentoId) return { erro: "Escolha o departamento da despesa." }
  if (!centroCustoId) return { erro: "Escolha o centro de custo da despesa." }
  const [departamentos, centros] = await Promise.all([
    listarDepartamentos(),
    listarCentrosCustoParaCompra(),
  ])
  if (!departamentos.some((d) => d.id === departamentoId)) {
    return { erro: "Departamento inválido." }
  }
  if (!centros.some((c) => c.id === centroCustoId)) {
    return { erro: "Centro de custo inválido." }
  }
  return {
    origem: { contratoId: null, fornecedorId: prestador.id, departamentoId, centroCustoId },
  }
}

/**
 * Emite o RPA — de um contrato ou avulso — e, junto com o recibo, a ordem de
 * pagamento do valor LÍQUIDO, Em autorização, com a forma de pagamento e o
 * "para onde" completos (chave/conta do prestador, código Pix, boleto ou
 * conta de caixa). Se a ordem falhar, o RPA é desfeito.
 *
 * Dinheiro: só grava a conta de caixa na ordem — o caixa é debitado quando a
 * ordem é paga, não na emissão.
 */
export async function emitirRpa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await exigirEdicao()
  const avulso = txt(fd, "modo") === "avulso"
  const { origem, erro: erroOrigem } = avulso
    ? await origemAvulsa(fd)
    : await origemDoContrato(fd)
  if (!origem) return { erro: erroOrigem ?? "Dados do RPA inválidos." }

  const descricao = txt(fd, "descricao_servico")
  const base = txt(fd, "base") === "liquido" ? "liquido" : "bruto"
  const valor = num(fd, "valor")
  const pagarEm = txt(fd, "pagar_em")
  const forma = txt(fd, "forma_pagamento")
  if (!descricao) return { erro: "Descreva o serviço prestado." }
  if (valor === null || valor <= 0) return { erro: "Informe o valor (ex.: 1.500,00)." }
  if (!pagarEm || !/^\d{4}-\d{2}-\d{2}$/.test(pagarEm)) {
    return { erro: "Informe a data do pagamento (Pagar em)." }
  }
  if (!forma || !(FORMAS_PAGAMENTO_RPA as readonly string[]).includes(forma)) {
    return { erro: "Escolha a forma de pagamento." }
  }
  const { fornecedorId } = origem

  const cfg = await obterConfigRpa()
  const op: OpcoesRpa = {
    dependentes: Math.max(0, Math.round(numSolto(fd, "dependentes") ?? 0)),
    reterInss: fd.get("reter_inss") === "on",
    reterIrrf: fd.get("reter_irrf") === "on",
    reterIss: fd.get("reter_iss") === "on",
    issAliquota: numSolto(fd, "iss_aliquota") ?? cfg.iss_aliquota_padrao,
  }
  const r =
    base === "liquido"
      ? calcularPorLiquido(valor, cfg, op)
      : calcularPorBruto(valor, cfg, op)
  if (!(r.valorLiquido > 0)) return { erro: "O valor líquido ficou zerado — confira o valor e as retenções." }

  // Por último: chave/conta NOVA do prestador vai para o cadastro dele aqui.
  // Valor 0 na conferência do caixa: ele só é debitado no pagamento da ordem.
  const { detalhe, boleto, erro: erroDetalhe } = await lerDetalhePagamento(
    fd,
    forma as FormaPagamentoRpa,
    fornecedorId,
    0
  )
  if (erroDetalhe || !detalhe) return { erro: erroDetalhe ?? "Dados de pagamento inválidos." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  if (boleto) {
    const up = await subirComprovanteCompras("boletos", boleto)
    if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir o boleto." }
    detalhe.arquivo_boleto = up.caminho
  }
  const apagarBoleto = async () => {
    if (detalhe.arquivo_boleto) await admin.storage.from("compras").remove([detalhe.arquivo_boleto])
  }

  // até 3 tentativas para o número sequencial (colisão só com emissão simultânea)
  let rpaId: string | null = null
  let rpaNumero: number | null = null
  let ultimoErro = ""
  for (let i = 0; i < 3 && !rpaId; i++) {
    const numero = await proximoNumeroRpa()
    const { data, error } = await admin
      .from("compras_rpa")
      .insert({
        emp_proprietaria_id: emp,
        numero,
        contrato_id: origem.contratoId,
        fornecedor_id: fornecedorId,
        descricao_servico: descricao,
        data_servico: txt(fd, "data_servico"),
        base,
        valor_informado: valor,
        valor_bruto: r.valorBruto,
        inss: r.inss,
        irrf: r.irrf,
        iss: r.iss,
        iss_aliquota: op.reterIss ? op.issAliquota : null,
        dependentes: op.dependentes,
        valor_liquido: r.valorLiquido,
        observacoes: txt(fd, "observacoes"),
        criado_por: sessao.usuario.id,
      })
      .select("id")
      .single()
    if (data) {
      rpaId = data.id as string
      rpaNumero = numero
    } else {
      if (esquemaAusente(error)) {
        await apagarBoleto()
        return { erro: AVISO_SQL_RPA_CONTRATO }
      }
      ultimoErro = error?.message ?? ""
    }
  }
  if (!rpaId) {
    await apagarBoleto()
    return { erro: `Não foi possível emitir: ${ultimoErro}` }
  }

  // A ordem do líquido, para o prestador, com a forma e o "para onde".
  const { data: ordem, error: erroOrdem } = await inserirOrdemVerificada({
      codigo: gerarCodigoProcesso(),
      tipo: TIPO_ORDEM_RPA,
      descricao: `RPA nº ${rpaNumero} — ${descricao}`,
      situacao: "Em autorização",
      valor_inicial_cobranca: r.valorLiquido,
      forma_pagamento: forma,
      vencimento: pagarEm,
      beneficiario_fornecedor_id: fornecedorId,
      departamento_id: origem.departamentoId,
      centro_custo_despesa_id: origem.centroCustoId,
      contrato_id: origem.contratoId,
      ...detalhe,
      excluido: false,
      emp_proprietaria_id: emp,
    }, {})
  const vinculo = ordem
    ? await admin.from("compras_rpa").update({ ordem_pagamento_id: ordem.id }).eq("id", rpaId)
    : null
  if (!ordem || vinculo?.error) {
    if (ordem) await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
    await admin.from("compras_rpa").delete().eq("id", rpaId)
    await apagarBoleto()
    const motivo = erroOrdem?.message ?? vinculo?.error?.message ?? "?"
    return { erro: `O RPA não foi emitido: a ordem de pagamento falhou (${motivo}).` }
  }
  await registrarEvento(
    ordem.id,
    "criada",
    await usuarioDaTrilha(),
    `Gerada pelo RPA nº ${rpaNumero}${origem.contratoId ? " (de contrato)" : " (avulso)"}.`
  )

  revalidatePath("/painel/compras/contratos/rpa")
  if (origem.contratoId) revalidatePath(`/painel/compras/contratos/${origem.contratoId}`)
  redirect(`/painel/compras/contratos/rpa/${rpaId}?salvo=1`)
}

/**
 * Exclui o RPA que ainda NÃO tem o recibo assinado anexado — assinado, ele é
 * comprovante fiscal e fica. A ordem do líquido vai junto, mas só enquanto
 * ninguém a autorizou; depois, o Financeiro precisa cancelá-la antes.
 */
export async function excluirRpa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = txt(fd, "id")
  if (!id) return { erro: "RPA inválido." }
  const rpa = await buscarRpa(id)
  if (!rpa) return { erro: "RPA não encontrado." }
  if (rpa.arquivoAssinado) {
    return {
      erro: "Este RPA já tem o recibo assinado pelo prestador — é comprovante fiscal e não pode ser excluído.",
    }
  }
  if (rpa.ordemId && rpa.ordemSituacao !== "Em autorização") {
    return {
      erro: `A ordem de pagamento deste RPA já está "${rpa.ordemSituacao}" — peça ao Financeiro para cancelá-la antes de excluir o RPA.`,
    }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // A ordem primeiro, e só se continua Em autorização (alguém pode tê-la
  // autorizado agora): assim não sobra ordem órfã de RPA apagado.
  if (rpa.ordemId) {
    const { data: apagadas, error: erroOrdem } = await admin
      .from("ordens_pagamento")
      .delete()
      .eq("id", rpa.ordemId)
      .eq("emp_proprietaria_id", emp)
      .eq("situacao", "Em autorização")
      .select("id")
    if (erroOrdem) return { erro: `Não foi possível excluir a ordem do RPA: ${erroOrdem.message}` }
    if (!apagadas?.length) {
      return { erro: "A ordem de pagamento deste RPA mudou de situação — recarregue a página." }
    }
  }
  const { error } = await admin
    .from("compras_rpa")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidatePath("/painel/compras/contratos/rpa")
  if (rpa.contratoId) {
    revalidatePath(`/painel/compras/contratos/${rpa.contratoId}`)
    if (txt(fd, "voltar") !== "lista") {
      redirect(`/painel/compras/contratos/${rpa.contratoId}?rpaExcluido=1`)
    }
  }
  redirect("/painel/compras/contratos/rpa?excluido=1")
}

/**
 * Anexa o recibo assinado pelo prestador (PDF ou foto). Com ele, o RPA vira
 * comprovante fiscal e não pode mais ser excluído; anexar de novo substitui o
 * arquivo (ex.: digitalização ilegível).
 */
export async function anexarRpaAssinado(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await exigirEdicao()
  const id = txt(fd, "id")
  const rpa = id ? await buscarRpa(id) : null
  if (!id || !rpa) return { erro: "RPA não encontrado." }
  const arquivo = fd.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo do recibo assinado (PDF ou foto)." }
  }
  const up = await subirComprovanteCompras(`rpa-assinados/${id}`, arquivo)
  if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir o arquivo." }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("compras_rpa")
    .update({
      arquivo_assinado: up.caminho,
      assinado_em: new Date().toISOString(),
      assinado_por_id: sessao.usuario.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    await admin.storage.from("compras").remove([up.caminho])
    if (esquemaAusente(error)) return { erro: AVISO_SQL_RPA_ASSINATURA }
    return { erro: `Não foi possível anexar: ${error.message}` }
  }
  // O anterior (substituído) sai do bucket.
  if (rpa.arquivoAssinado && !/^(https?:)?\/\//.test(rpa.arquivoAssinado)) {
    await admin.storage.from("compras").remove([rpa.arquivoAssinado])
  }
  revalidatePath(`/painel/compras/contratos/rpa/${id}`)
  revalidatePath("/painel/compras/contratos/rpa")
  if (rpa.contratoId) revalidatePath(`/painel/compras/contratos/${rpa.contratoId}`)
  return {
    ok: rpa.arquivoAssinado
      ? "Recibo assinado substituído."
      : "Recibo assinado anexado — o RPA não pode mais ser excluído.",
  }
}

export async function salvarConfigRpa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const faixas: { ate: number | null; aliquota: number; deduzir: number }[] = []
  for (let i = 0; i < 5; i++) {
    const aliquota = numSolto(fd, `faixa_aliquota_${i}`)
    if (aliquota === null) continue
    const ate = i === 4 ? null : numSolto(fd, `faixa_ate_${i}`)
    if (i < 4 && ate === null) continue
    faixas.push({
      ate,
      aliquota,
      deduzir: numSolto(fd, `faixa_deduzir_${i}`) ?? 0,
    })
  }
  if (faixas.length === 0) return { erro: "Informe a tabela do IRRF." }
  const admin = await createAdminClient()
  const { error } = await admin.from("compras_rpa_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      inss_aliquota: numSolto(fd, "inss_aliquota") ?? 11,
      inss_teto: numSolto(fd, "inss_teto") ?? 0,
      irrf_faixas: faixas,
      irrf_deducao_dependente: numSolto(fd, "irrf_deducao_dependente") ?? 0,
      iss_aliquota_padrao: numSolto(fd, "iss_aliquota_padrao") ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  revalidatePath("/painel/compras/contratos/rpa")
  return { ok: "Tabelas de retenção salvas — valem para os próximos RPAs." }
}
