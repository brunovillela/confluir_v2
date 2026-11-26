import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { listarEnvios, resumoEmails, type EnvioEmail, type LinhaEmail } from "@/lib/db/email-uso"
import { processoEmail, ROTULO_ESTADO, tituloModuloEmail } from "@/lib/email-processos"
import { registrarExportacao } from "@/lib/exportacoes"
import { formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { planilhaXlsxAbas, respostaXlsx, type AbaXlsx, type ColunaXlsx } from "@/lib/xlsx"

import { intervalo, PERIODOS_PLANILHA } from "../../ia/periodos"

const LOTE = 1000
const MAX_LOTES = 100

function colunasResumo(titulo: string, detalhe?: string): ColunaXlsx<LinhaEmail>[] {
  return [
    { titulo, valor: (l) => l.rotulo, largura: 44 },
    ...(detalhe ? [{ titulo: detalhe, valor: (l: LinhaEmail) => l.detalhe, largura: 22 }] : []),
    { titulo: "E-mails", valor: (l) => l.enviados, largura: 10 },
    { titulo: "Entregues", valor: (l) => l.entregues, largura: 10 },
    { titulo: "Rejeitados", valor: (l) => l.rejeitados, largura: 10 },
    { titulo: "Não saíram", valor: (l) => l.falhas, largura: 10 },
    { titulo: "Último envio", valor: (l) => (l.ultima ? formatarDataHora(l.ultima) : null), largura: 18 },
  ]
}

function aba<T>(nome: string, colunas: ColunaXlsx<T>[], linhas: T[]): AbaXlsx<unknown> {
  return { aba: nome, colunas: colunas as ColunaXlsx<unknown>[], linhas }
}

/** E-mails enviados em planilha (Gestão › E-mail): os resumos e cada envio, com o destinatário. */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "gestao_sistema")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sp = new URL(request.url).searchParams
  const periodo = PERIODOS_PLANILHA.find((p) => p.valor === sp.get("periodo"))?.valor ?? "mes"
  const { de, ate } = intervalo(periodo)

  const [resumo, envios] = await Promise.all([
    resumoEmails(de, ate),
    (async () => {
      const todos: EnvioEmail[] = []
      for (let i = 0; i < MAX_LOTES; i++) {
        const lote = await listarEnvios({ de, ate }, LOTE, i * LOTE)
        todos.push(...lote.envios)
        if (lote.envios.length < LOTE) break
      }
      return todos
    })(),
  ])
  if (!resumo.disponivel) return new Response("O registro dos e-mails não está disponível.", { status: 503 })

  const abas: AbaXlsx<unknown>[] = [
    aba("Por processo", colunasResumo("Processo", "Módulo"), resumo.por.processo),
    aba("Por módulo", colunasResumo("Módulo"), resumo.por.modulo),
    aba("Por pessoa", colunasResumo("Quem disparou"), resumo.por.usuario),
    aba("Por departamento", colunasResumo("Departamento"), resumo.por.departamento),
    aba<EnvioEmail>(
      "Envios",
      [
        { titulo: "Data e hora", valor: (e) => formatarDataHora(e.criadoEm), largura: 17 },
        { titulo: "Destinatário", valor: (e) => e.destinatario, largura: 34 },
        { titulo: "Processo", valor: (e) => processoEmail(e.processo).titulo, largura: 44 },
        { titulo: "Módulo", valor: (e) => tituloModuloEmail(e.modulo), largura: 18 },
        { titulo: "Quem disparou", valor: (e) => e.pessoa ?? "Automático ou público", largura: 28 },
        { titulo: "Departamento", valor: (e) => e.departamento, largura: 24 },
        { titulo: "Situação", valor: (e) => ROTULO_ESTADO[e.estado], largura: 20 },
        { titulo: "Entregue em", valor: (e) => (e.entregueEm ? formatarDataHora(e.entregueEm) : null), largura: 17 },
        { titulo: "Rejeição", valor: (e) => e.rejeicao, largura: 36 },
        { titulo: "Erro no envio", valor: (e) => e.erro, largura: 30 },
        { titulo: "Anexos", valor: (e) => e.anexos, largura: 8 },
      ],
      envios
    ),
  ]

  await registrarExportacao(request, { usuarioId: sessao.usuario.id, recurso: "email_envios", formato: "xlsx", quantidade: envios.length })
  return respostaXlsx(`emails-${periodo.replace("_", "-")}`, planilhaXlsxAbas(abas))
}
