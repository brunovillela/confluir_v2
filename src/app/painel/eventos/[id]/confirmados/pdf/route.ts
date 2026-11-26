import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requirePermissao } from "@/lib/auth"
import { obterEvento } from "@/lib/db/eventos"
import { relacaoDeConfirmados } from "@/lib/db/eventos-relacao"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { obterOrganizacao, urlLogo } from "@/lib/db/organizacao"
import { cpfParcial, descreverRecorte, lerOpcoesRelacao } from "@/lib/eventos-relacao-opcoes"
import { registrarExportacao } from "@/lib/exportacoes"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { RelacaoConfirmadosPDF } from "@/lib/pdf/relacao-confirmados"

export const runtime = "nodejs"
// Evento grande (centenas de confirmados, dezenas de páginas).
export const maxDuration = 120

/**
 * Relação de confirmados do evento em PDF (19/11/2026). `?assinatura=1` troca
 * o telefone por uma coluna de assinatura: vira lista de presença em papel.
 * Os demais recortes (quem, espera, CPF parcial, contato) são os do Excel.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePermissao("eventos_gestao")
  const { id } = await params
  const evento = await obterEvento(id)
  if (!evento) return new Response("Não encontrado", { status: 404 })

  const sp = new URL(request.url).searchParams
  const assinatura = sp.get("assinatura") === "1"
  const opcoes = lerOpcoesRelacao(sp)
  const [{ linhas, dias, diaEscolhido }, org] = await Promise.all([
    relacaoDeConfirmados(id, opcoes),
    obterOrganizacao().catch(() => null),
  ])
  const recorte = descreverRecorte(
    opcoes,
    diaEscolhido ? `${formatarData(diaEscolhido.data)}${diaEscolhido.rotulo ? ` — ${diaEscolhido.rotulo}` : ""}` : null
  )
  const titulo =
    opcoes.presenca === "presentes"
      ? "Relação de presença"
      : opcoes.presenca === "ausentes"
        ? "Confirmados que faltaram"
        : undefined
  const logo = await logoDataUri(urlLogo(org?.logomarca ?? null))
  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "eventos_confirmados",
    formato: "pdf",
    quantidade: linhas.length,
    filtros: { evento: evento.titulo ?? id, assinatura, recorte },
  })

  const quando = [
    evento.inicio ? formatarDataHora(evento.inicio) : null,
    evento.local,
  ]
    .filter(Boolean)
    .join(" · ")

  const elemento = createElement(RelacaoConfirmadosPDF, {
    entidade: org?.nomeFantasia ?? org?.nomeRazao ?? null,
    logoDataUri: logo,
    evento: evento.titulo ?? "(sem título)",
    quando,
    assinatura,
    telefone: opcoes.contato,
    recorte,
    titulo,
    // "Dias" só interessa quando o recorte é de presença e o evento tem vários.
    totalDias: opcoes.presenca !== "todos" && !diaEscolhido ? dias.length : 0,
    linhas: linhas.map((l) => ({
      nome: l.nome,
      cpf: opcoes.cpfParcial ? cpfParcial(l.cpf) : l.cpf ? formatarCnpjCpf(l.cpf) : null,
      telefone: l.telefone,
      filiado: !!l.filiacao_id,
      convidado: !!l.reservada_por,
      espera: l.situacao === "lista_espera",
      diasPresente: l.diasPresente.size,
    })),
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)
  const prefixo =
    opcoes.presenca === "presentes" ? "presentes" : opcoes.presenca === "ausentes" ? "faltaram" : "confirmados"
  const arquivo = `${assinatura ? "lista-presenca" : prefixo}-${evento.slug || id.slice(0, 8)}.pdf`
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${arquivo}"`,
      "Cache-Control": "no-store",
    },
  })
}
