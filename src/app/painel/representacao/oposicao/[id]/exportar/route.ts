import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { podeNaOposicao } from "@/lib/db/oposicao-regras"
import { exportarOpositores } from "@/lib/db/oposicao-gestao"
import { registrarExportacao } from "@/lib/exportacoes"
import { mascaraCpf } from "@/lib/mascaras"
import { MODOS_FORMALIZACAO, ROTULO_SITUACAO_OPOSITOR, SITUACOES_OPOSITOR, type SituacaoOpositor } from "@/lib/oposicao-constantes"
import { dataXlsx, planilhaXlsx, respostaXlsx } from "@/lib/xlsx"

/** Data e hora de São Paulo como texto ("27/10/2026 14:32"), para a planilha. */
function dataHoraSP(iso: string | null): string | null {
  if (!iso) return null
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

/** Oposições da campanha em XLSX, com os filtros da tela (C7 da avaliação). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeNaOposicao(sessao.permissoes, "consultar", null)) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id } = await params
  const sp = new URL(request.url).searchParams
  const situacao = SITUACOES_OPOSITOR.some((s) => s.chave === sp.get("situacao"))
    ? (sp.get("situacao") as SituacaoOpositor)
    : "todas"
  const linhas = await exportarOpositores({
    campanhaId: id,
    situacao,
    busca: (sp.get("busca") ?? "").trim(),
    fonteId: sp.get("fonte") || undefined,
  })

  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "oposicao",
    formato: "xlsx",
    quantidade: linhas.length,
    filtros: { campanha: id },
  })
  const modo = (m: string | null) => MODOS_FORMALIZACAO.find((x) => x.chave === m)?.rotulo ?? m
  const bytes = planilhaXlsx("Oposições", [
    { titulo: "Protocolo", valor: (o) => o.protocolo, largura: 10 },
    { titulo: "Nome", valor: (o) => o.nome, largura: 36 },
    { titulo: "CPF", valor: (o) => (o.cpf ? mascaraCpf(o.cpf) : null), largura: 16 },
    { titulo: "Matrícula", valor: (o) => o.matricula, largura: 14 },
    { titulo: "Fonte pagadora", valor: (o) => o.empregadorNome, largura: 30 },
    { titulo: "CNPJ da fonte", valor: (o) => o.empregadorCnpj, largura: 20 },
    { titulo: "Lotação", valor: (o) => o.lotacao },
    { titulo: "Perfil", valor: (o) => o.perfil, largura: 12 },
    { titulo: "Situação", valor: (o) => ROTULO_SITUACAO_OPOSITOR[o.situacao], largura: 20 },
    { titulo: "Registrada em", valor: (o) => dataHoraSP(o.confirmadoEm), largura: 18 },
    { titulo: "Formalização", valor: (o) => modo(o.modoAto), largura: 22 },
    { titulo: "Prazo do ato", valor: (o) => dataXlsx(o.prazoFimAto) },
    { titulo: "Carta enviada em", valor: (o) => dataHoraSP(o.documentoEnviadoEm), largura: 18 },
    { titulo: "Assinatura", valor: (o) => o.assinatura, largura: 28 },
    { titulo: "Avaliada em", valor: (o) => dataXlsx(o.avaliacaoData) },
    { titulo: "Avaliador", valor: (o) => o.avaliador, largura: 24 },
    { titulo: "Motivo da reprovação", valor: (o) => o.motivo, largura: 40 },
    { titulo: "E-mail", valor: (o) => o.email, largura: 30 },
    { titulo: "Telefone", valor: (o) => o.telefone, largura: 16 },
    { titulo: "IP do registro", valor: (o) => o.ip, largura: 16 },
  ], linhas)
  return respostaXlsx("oposicoes", bytes)
}
