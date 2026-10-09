import "server-only"

import { createHash } from "node:crypto"

import { descreverPagoCom } from "@/lib/db/compras-pagamento"
import { pagoComDoCusteio } from "@/lib/db/custeio"
import { detalheOrdem, type CentroCusto, type DetalheOrdem } from "@/lib/db/financeiro"
import { auditarOrdem, type ResultadoAuditoria } from "@/lib/db/ordens-auditoria"
import { listarEventos, type EventoOrdem } from "@/lib/db/ordens-ciclo"
import { procedenciaDaOrdem, type Procedencia } from "@/lib/db/ordens-procedencia"
import { rateioDaOrdem, type LinhaRateio } from "@/lib/db/ordens-rateio"
import { verificacoesDaOrdem, type VerificacaoGravada } from "@/lib/db/ordens-verificacao"
import { formatarCnpjCpf } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Tudo o que audita uma ordem de pagamento, num lugar só — usado pela tela da
 * ordem e pelo extrato em PDF: procedência, despesa, favorecido, classificação
 * (despesa e débito), autorização, pagamento, recebimento, documentos,
 * auditoria automática e a trilha de eventos.
 */

export type ExtratoCompleto = {
  detalhe: DetalheOrdem
  procedencia: Procedencia
  auditoria: ResultadoAuditoria
  eventos: EventoOrdem[]
  /** Regras de auditoria conferidas na criação da ordem (configuração do tenant). */
  verificacoes: VerificacaoGravada[]
  rateio: LinhaRateio[]
  pagoCom: string | null
  favorecido: { nome: string | null; documento: string | null; tipo: string | null }
  autorizacao: {
    situacao: "dispensada" | "autorizada" | "devolvida" | "pendente" | "encerrada"
    texto: string
  }
  arquivos: {
    notaFiscal: string | null
    /** Rótulo do documento fiscal (ex.: "RPA assinado" quando a ordem paga um RPA). */
    rotuloNotaFiscal?: string
    boleto: string | null
    comprovante: string | null
    orcamento: string | null
  }
  /** Resumo SHA-256 dos dados essenciais — confere se o extrato é o do sistema. */
  codigoVerificacao: string
}

/** O bucket vem do prefixo do caminho: compras (notas/, boletos/, rpa-assinados/) ou comprovantes. */
export async function urlArquivoOrdem(valor: unknown): Promise<string | null> {
  if (typeof valor !== "string" || !valor.trim()) return null
  if (/^https?:\/\//.test(valor)) return valor
  if (valor.startsWith("//")) return `https:${valor}`
  const bucket = /^(notas|boletos|rpa-assinados)\//.test(valor) ? "compras" : "comprovantes"
  const admin = await createAdminClient()
  const { data } = await admin.storage.from(bucket).createSignedUrl(valor, 3600)
  return data?.signedUrl ?? null
}

export function textoCentro(c: CentroCusto | null): string | null {
  return c ? [c.acesso, c.nome_da_conta ?? "(sem nome)"].filter(Boolean).join(" — ") : null
}

export async function extratoDaOrdem(id: string): Promise<ExtratoCompleto | null> {
  const detalhe = await detalheOrdem(id)
  if (!detalhe) return null
  const o = detalhe.ordem as Record<string, unknown>
  const admin = await createAdminClient()

  const procedencia = await procedenciaDaOrdem(o)
  // Ordem que paga um RPA: o documento fiscal é o RPA ASSINADO (no de
  // contrato a ordem nem tem nota; no de compra, a nota pode ser outra).
  const { data: rpa } = await admin
    .from("compras_rpa")
    .select("numero, arquivo_assinado")
    .eq("ordem_pagamento_id", id)
    .maybeSingle()
  const rpaAssinado = typeof rpa?.arquivo_assinado === "string" && rpa.arquivo_assinado ? rpa.arquivo_assinado : null
  const [auditoria, eventosGravados, verificacoes, rateio, pagoComDetalhe, notaFiscal, boleto, comprovante, orcamento] =
    await Promise.all([
      auditarOrdem(o, procedencia),
      listarEventos(id),
      verificacoesDaOrdem(id),
      rateioDaOrdem(id),
      descreverPagoCom(o),
      urlArquivoOrdem(rpaAssinado ?? o.arquivo_nota_fiscal),
      urlArquivoOrdem(o.arquivo_boleto),
      urlArquivoOrdem(o.arquivo_pagamento),
      urlArquivoOrdem(o.arquivo_orcamento),
    ])

  // Custeio: a chave/conta do beneficiário fica no custeio, não em dados_bancarios.
  const pagoCom =
    pagoComDetalhe ??
    (o.custeio_id ? await pagoComDoCusteio(String(o.custeio_id), (o.forma_pagamento as string | null) ?? null) : null)

  // Favorecido com documento e natureza (PF/PJ).
  let favorecido: ExtratoCompleto["favorecido"] = { nome: detalhe.favorecido, documento: null, tipo: null }
  const fornId = (o.beneficiario_fornecedor_id ?? o.fornecedor_id) as string | null
  if (fornId) {
    const { data: e } = await admin.from("empresa").select("cnpj_cpf, pessoa_juridica").eq("id", fornId).maybeSingle()
    const doc = (e?.cnpj_cpf as string | null) ?? null
    favorecido = {
      nome: detalhe.favorecido,
      documento: doc ? formatarCnpjCpf(doc) : null,
      tipo: doc ? (doc.replace(/\D/g, "").length === 11 ? "Pessoa física" : "Pessoa jurídica") : e?.pessoa_juridica ? "Pessoa jurídica" : null,
    }
  } else if (o.beneficiario_usuario_id) {
    const { data: u } = await admin.from("usuarios").select("cpf, vinculo_instituicao").eq("id", String(o.beneficiario_usuario_id)).maybeSingle()
    favorecido = {
      nome: detalhe.favorecido,
      documento: u?.cpf ? formatarCnpjCpf(String(u.cpf)) : null,
      tipo: [
        "Pessoa física",
        typeof u?.vinculo_instituicao === "string" ? u.vinculo_instituicao : null,
      ].filter(Boolean).join(" · "),
    }
  } else if (o.beneficiario_doc_avulso) {
    favorecido = { nome: detalhe.favorecido, documento: formatarCnpjCpf(String(o.beneficiario_doc_avulso)), tipo: "Favorecido avulso" }
  }

  // Autorização em uma frase.
  const situacao = String(o.situacao ?? "")
  let autorizacao: ExtratoCompleto["autorizacao"]
  if (o.autorizacao_dispensada === true) {
    autorizacao = { situacao: "dispensada", texto: String(o.autorizacao_dispensa_motivo ?? "Autorização dispensada.") }
  } else if (o.autorizacao_esta_autorizado === true) {
    autorizacao = {
      situacao: "autorizada",
      texto: `Aprovada${detalhe.autorizador ? ` por ${detalhe.autorizador}` : ""}${o.autorizacao_data ? ` em ${String(o.autorizacao_data).split("-").reverse().join("/")}` : ""}.`,
    }
  } else if (situacao === "Aguardando informações") {
    autorizacao = { situacao: "devolvida", texto: `Devolvida${detalhe.autorizador ? ` por ${detalhe.autorizador}` : ""}: ${String(o.autorizacao_observacao ?? "—")}` }
  } else if (situacao === "Cancelada" || situacao === "Estornado") {
    autorizacao = { situacao: "encerrada", texto: `Ordem ${situacao.toLowerCase()}.` }
  } else {
    autorizacao = { situacao: "pendente", texto: "Aguardando avaliação por quem tem alçada." }
  }

  // Trilha: completa com a criação e a dispensa (ordens anteriores à trilha).
  const eventos: EventoOrdem[] = [...eventosGravados]
  if (!eventos.some((e) => e.tipo === "criada") && o.created_at) {
    eventos.unshift({
      id: "criada",
      tipo: "criada",
      rotulo: "Criada",
      usuario: procedencia.solicitante?.nome ?? null,
      usuarioId: procedencia.solicitante?.id ?? null,
      descricao: `Origem: ${procedencia.origem}.`,
      dados: null,
      quando: String(o.created_at),
    })
  }
  if (o.autorizacao_dispensada === true && !eventos.some((e) => e.tipo === "autorizacao_dispensada")) {
    eventos.splice(1, 0, {
      id: "dispensa",
      tipo: "autorizacao_dispensada",
      rotulo: "Autorização dispensada",
      usuario: null,
      usuarioId: null,
      descricao: String(o.autorizacao_dispensa_motivo ?? ""),
      dados: null,
      quando: String(o.created_at ?? ""),
    })
  }

  const essencial = {
    id,
    codigo: o.codigo,
    tipo: o.tipo,
    situacao: o.situacao,
    valor: o.valor_inicial_cobranca,
    vencimento: o.vencimento,
    favorecido: fornId ?? o.beneficiario_usuario_id ?? o.beneficiario_doc_avulso ?? null,
    centroDespesa: o.centro_custo_despesa_id,
    centroDebito: o.centro_custo_receita_id,
    autorizado: o.autorizacao_esta_autorizado,
    autorizador: o.autorizacao_autorizador_id,
    autorizacaoData: o.autorizacao_data,
    valorPago: o.valor_pago,
    dataPagamento: o.data_pagamento,
    nota: o.arquivo_nota_fiscal,
    comprovante: o.arquivo_pagamento,
  }
  const codigoVerificacao = createHash("sha256")
    .update(JSON.stringify(essencial))
    .digest("hex")
    .slice(0, 16)
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, "$1-")

  return {
    detalhe,
    procedencia,
    auditoria,
    eventos,
    verificacoes,
    rateio,
    pagoCom,
    favorecido,
    autorizacao,
    arquivos: {
      notaFiscal,
      boleto,
      comprovante,
      orcamento,
      ...(rpaAssinado && rpa ? { rotuloNotaFiscal: `RPA nº ${rpa.numero ?? "—"} assinado (documento fiscal)` } : {}),
    },
    codigoVerificacao,
  }
}
