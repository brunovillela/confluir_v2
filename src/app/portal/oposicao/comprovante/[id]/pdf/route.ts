import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requireSessaoTrabalhador } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { obterComprovante } from "@/lib/db/oposicao"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarCnpjCpf, formatarDataHora } from "@/lib/formato"
import { estadoPrazo } from "@/lib/oposicao-constantes"
import { ComprovanteOposicaoPDF } from "@/lib/pdf/comprovante-oposicao"
import { origemAtual } from "@/lib/tenant-url"

import {
  DEPOIS_DE_ACEITA,
  fraseResultado,
  ROTULO_SITUACAO_PORTAL,
} from "../../../situacao-portal"
import { logoDataUri } from "@/lib/pdf/logo-pdf"

export const runtime = "nodejs"

/**
 * Comprovante da oposição em PDF (A107). Só o dono: a oposição é lida pelo
 * CPF da sessão, como na tela. Quem optou por não se opor não tem
 * comprovante de oposição.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessao = await requireSessaoTrabalhador()
  const { id } = await params
  const c = await obterComprovante(id, sessao.cpf)
  if (!c) return new Response("Não encontrado", { status: 404 })
  if (c.situacao === "desistente") {
    return new Response(
      "Este registro é de quem optou por não se opor: não há comprovante de oposição.",
      { status: 404 }
    )
  }

  const [org, origem] = await Promise.all([
    obterOrganizacao(),
    origemAtual().catch(() => null),
  ])
  const logo = await logoDataUri(org?.logoUrl ?? null)

  // "Falta enviar a carta até dd/mm" só enquanto o prazo está aberto.
  const prazoAberto =
    c.campanhaAberta && estadoPrazo(c.prazo_inicio, c.prazo_fim, hojeSP()) === "aberto"
  const resultado = fraseResultado(c.situacao, {
    avaliadaEm: c.avaliacao_data,
    registradaEm: c.dia,
    prazoFim: prazoAberto ? c.prazo_fim : null,
  })
  const elemento = createElement(ComprovanteOposicaoPDF, {
    dados: {
      organizacao: org?.nomeRazao ?? org?.nomeFantasia ?? null,
      cnpj: org?.cnpjCpf ? formatarCnpjCpf(org.cnpjCpf) : null,
      protocolo: c.protocolo,
      registradoEm: formatarDataHora(c.confirmado_em),
      emitidoEm: formatarDataHora(new Date().toISOString()),
      nome: c.nome,
      cpf: c.cpf,
      matricula: c.matricula,
      empregador: c.empregadorNome,
      campanha: c.campanhaNome,
      detalhe: c.detalhe_desconto,
      declaracao: c.texto_declaracao,
      situacao: ROTULO_SITUACAO_PORTAL[c.situacao],
      resultado: c.situacao === "aprovada" ? `${resultado} ${DEPOIS_DE_ACEITA}` : resultado,
      motivo: c.situacao === "reprovada" ? c.reprovacao_motivo : null,
      documento: c.temDocumento
        ? c.documentoRecebidoEm
          ? `Recebida em ${formatarDataHora(c.documentoRecebidoEm)}`
          : "Recebida"
        : null,
      url: origem ? `${origem}/portal/oposicao/comprovante/${c.id}` : null,
    },
    logoDataUri: logo,
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  const nome = c.protocolo != null ? `protocolo-${c.protocolo}` : id.slice(0, 8)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="comprovante-oposicao-${nome}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
