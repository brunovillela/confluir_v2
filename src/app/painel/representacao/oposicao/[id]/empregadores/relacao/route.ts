import { createElement } from "react"
import type { NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"

import { getSessaoPainel } from "@/lib/auth"
import { obterCampanha } from "@/lib/db/oposicao"
import { aprovadasDoEmpregador } from "@/lib/db/oposicao-gestao"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { registrarExportacao } from "@/lib/exportacoes"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"
import { logoDataUri } from "@/lib/pdf/logo-pdf"
import { RelacaoOposicaoPDF } from "@/lib/pdf/relacao-oposicao"
import { podeAcessar } from "@/lib/permissoes"
import { planilhaXlsx, respostaXlsx } from "@/lib/xlsx"

export const runtime = "nodejs"

/**
 * Relação das oposições APROVADAS de uma fonte pagadora (C7), em PDF (para
 * mandar ao RH) ou XLSX. `?empresa=<id>` ou `?empresa=sem` (sem fonte). Só a
 * lista: o registro do envio é um passo à parte, na página dos empregadores.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "oposicao")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id } = await params
  const sp = new URL(request.url).searchParams
  const empresa = sp.get("empresa")
  if (!empresa) return new Response("Informe a fonte pagadora.", { status: 400 })
  const empresaId = empresa === "sem" ? null : empresa
  const formato = sp.get("formato") === "xlsx" ? "xlsx" : "pdf"

  const [campanha, linhas] = await Promise.all([obterCampanha(id), aprovadasDoEmpregador(id, empresaId)])
  if (!campanha) return new Response("Campanha não encontrada", { status: 404 })
  linhas.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
  const empregador = empresaId ? (linhas[0]?.empregadorNome ?? "Fonte pagadora") : "Sem fonte informada"
  const cnpjEmpregador = empresaId && linhas[0]?.empregadorCnpj ? formatarCnpjCpf(linhas[0].empregadorCnpj) : null

  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "oposicao_empregador",
    formato,
    quantidade: linhas.length,
    filtros: { campanha: id, empresa },
  })
  const arquivo = `oposicoes-${(empregador || "fonte").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`

  if (formato === "xlsx") {
    const bytes = planilhaXlsx("Relação", [
      { titulo: "Nome", valor: (o) => o.nome, largura: 40 },
      { titulo: "CPF", valor: (o) => (o.cpf ? mascaraCpf(o.cpf) : null), largura: 16 },
      { titulo: "Matrícula", valor: (o) => o.matricula, largura: 14 },
      { titulo: "Protocolo", valor: (o) => o.protocolo, largura: 10 },
      { titulo: "Registrada em", valor: (o) => (o.confirmadoEm ? formatarDataHora(o.confirmadoEm) : null), largura: 18 },
      { titulo: "Lotação", valor: (o) => o.lotacao, largura: 20 },
    ], linhas)
    return respostaXlsx(arquivo, bytes)
  }

  const org = await obterOrganizacao()
  const logo = await logoDataUri(org?.logoUrl ?? null)
  const elemento = createElement(RelacaoOposicaoPDF, {
    dados: {
      organizacao: org?.nomeRazao ?? org?.nomeFantasia ?? null,
      cnpj: org?.cnpjCpf ? formatarCnpjCpf(org.cnpjCpf) : null,
      campanha: campanha.nome ?? campanha.codigo,
      detalhe: campanha.detalhe_desconto,
      prazo:
        campanha.prazo_inicio && campanha.prazo_fim
          ? `${formatarData(campanha.prazo_inicio)} a ${formatarData(campanha.prazo_fim)}`
          : null,
      empregador,
      empregadorCnpj: cnpjEmpregador,
      emitidoEm: formatarDataHora(new Date().toISOString()),
      emitidoPor: sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? null,
      linhas: linhas.map((l) => ({
        nome: l.nome,
        cpf: l.cpf ? mascaraCpf(l.cpf) : null,
        matricula: l.matricula,
        protocolo: l.protocolo,
        registradaEm: l.confirmadoEm ? formatarDataHora(l.confirmadoEm) : null,
      })),
    },
    logoDataUri: logo,
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${arquivo}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
