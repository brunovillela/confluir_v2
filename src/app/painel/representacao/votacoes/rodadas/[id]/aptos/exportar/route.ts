import type { NextRequest } from "next/server"

import { formatarCnpjCpf, formatarDataHora } from "@/lib/formato"
import { ROTULO_CANAL_CURTO } from "@/lib/pdf/relacao-aptos"
import { planilhaXlsx, respostaXlsx } from "@/lib/xlsx"

import { lerExtracaoAptos } from "../extracao"

export const runtime = "nodejs"
export const maxDuration = 120

/** Situação do link pessoal de voto, como na aba Aptos. */
function situacaoDoLink(a: { hora_voto: string | null; aviso_email_erro?: string | null; aviso_email_em?: string | null; aviso_primeiro_em?: string | null }): string {
  if (a.aviso_email_erro === "sem_email") return "Sem e-mail"
  if (a.aviso_email_erro === "falha" || a.aviso_email_erro === "rejeitado") return "Falha no envio"
  if (a.aviso_email_erro === "duplicado") return "E-mail repetido"
  const enviado = a.aviso_primeiro_em ?? a.aviso_email_em ?? null
  if (enviado) return `Enviado em ${formatarDataHora(enviado)}`
  return a.hora_voto ? "—" : "Não enviado"
}

/** Aptos da rodada em XLSX, com os filtros da aba Aptos (09/11/2026). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  const r = await lerExtracaoAptos(request, id, "xlsx")
  if (r instanceof Response) return r
  const bytes = planilhaXlsx("Aptos", [
    { titulo: "Nome", valor: (a) => a.nome_completo, largura: 38 },
    { titulo: "CPF", valor: (a) => (a.cpf ? formatarCnpjCpf(a.cpf) : null), largura: 16 },
    { titulo: "Matrícula", valor: (a) => a.matricula, largura: 14 },
    { titulo: "E-mail corporativo", valor: (a) => a.email_corporativo, largura: 32 },
    { titulo: "E-mail confirmado", valor: (a) => a.email_contato ?? null, largura: 32 },
    { titulo: "Telefone", valor: (a) => a.telefone ?? null, largura: 16 },
    { titulo: "Votou", valor: (a) => (a.hora_voto ? "Sim" : "Não"), largura: 8 },
    { titulo: "Data e hora do voto", valor: (a) => (a.hora_voto ? formatarDataHora(a.hora_voto) : null), largura: 18 },
    { titulo: "Canal", valor: (a) => (a.canal ? (ROTULO_CANAL_CURTO[a.canal] ?? a.canal) : null), largura: 14 },
    { titulo: "Link pessoal", valor: (a) => situacaoDoLink(a), largura: 26 },
  ], r.linhas)
  return respostaXlsx(`aptos-${r.codigo}`, bytes)
}
