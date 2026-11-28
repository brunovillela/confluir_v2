import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { getSessaoPainel } from "@/lib/auth"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { obterOrganizacao, urlLogo } from "@/lib/db/organizacao"
import { relatorioGeralPonto } from "@/lib/db/ponto-relatorio-geral"
import { registrarExportacao } from "@/lib/exportacoes"
import { podeAcessar } from "@/lib/permissoes"
import { RelatorioPontoGeralPDF } from "@/lib/pdf/relatorio-ponto-geral"

export const runtime = "nodejs"
export const maxDuration = 60

/** Relatório consolidado do ponto e das horas extras em PDF (Ponto, Fase 3 — 28/11/2026). */
export async function GET(request: Request) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "pessoal_gestao")) return new Response("Sem acesso", { status: 403 })
  const sp = Object.fromEntries(new URL(request.url).searchParams) as Record<string, string>
  const [{ relatorio, faixas, opcoes }, org] = await Promise.all([relatorioGeralPonto(sp), obterOrganizacao().catch(() => null)])
  const { filtro } = relatorio
  const recorte = filtro.funcionario
    ? (opcoes.funcionarios.find((f) => f.id === filtro.funcionario)?.nome ?? "Funcionário")
    : filtro.departamento
      ? (opcoes.departamentos.find((d) => d.chave === filtro.departamento)?.nome ?? "Departamento")
      : "Todos os departamentos"
  const logo = await logoDataUri(urlLogo(org?.logomarca ?? null))
  const elemento = createElement(RelatorioPontoGeralPDF, {
    relatorio,
    faixas,
    recorte,
    entidade: org?.nomeRazao ?? org?.nomeFantasia ?? "Organização",
    logoDataUri: logo,
    geradoEm: new Date().toISOString(),
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)
  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "ponto_relatorio",
    formato: "pdf",
    quantidade: relatorio.linhas.length,
    filtros: { de: filtro.de, ate: filtro.ate, departamento: filtro.departamento ?? "", funcionario: filtro.funcionario ?? "" },
  })
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-ponto-${filtro.de}-a-${filtro.ate}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
