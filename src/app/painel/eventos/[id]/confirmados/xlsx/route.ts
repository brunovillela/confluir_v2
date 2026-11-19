import { requirePermissao } from "@/lib/auth"
import { obterEvento } from "@/lib/db/eventos"
import { relacaoDeConfirmados, type LinhaConfirmado } from "@/lib/db/eventos-relacao"
import { registrarExportacao } from "@/lib/exportacoes"
import { formatarCnpjCpf, formatarTelefone } from "@/lib/formato"
import { dataXlsx, planilhaXlsx, respostaXlsx, type ColunaXlsx } from "@/lib/xlsx"

export const runtime = "nodejs"

const ROTULO_ORIGEM: Record<string, string> = {
  publica: "Link público",
  portal: "Portal do filiado",
  painel: "Painel (reserva interna)",
  planilha: "Planilha de convidados",
}

/**
 * Relação de confirmados do evento em Excel (19/11/2026), para importar em
 * sistemas sem integração com o Confluir. CPF e telefone saem como TEXTO
 * formatado: número no Excel come o zero à esquerda.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePermissao("eventos_gestao")
  const { id } = await params
  const evento = await obterEvento(id)
  if (!evento) return new Response("Não encontrado", { status: 404 })

  const { campos, linhas } = await relacaoDeConfirmados(id)
  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "eventos_confirmados",
    formato: "xlsx",
    quantidade: linhas.length,
    filtros: { evento: evento.titulo ?? id },
  })

  const colunas: ColunaXlsx<LinhaConfirmado>[] = [
    { titulo: "Nome", valor: (l) => l.nome, largura: 36 },
    { titulo: "CPF", valor: (l) => (l.cpf ? formatarCnpjCpf(l.cpf) : null), largura: 16 },
    { titulo: "E-mail", valor: (l) => l.email, largura: 32 },
    { titulo: "Telefone", valor: (l) => (l.telefone ? formatarTelefone(l.telefone) : null), largura: 16 },
    { titulo: "Filiado", valor: (l) => (l.filiacao_id ? "Sim" : "Não"), largura: 9 },
    { titulo: "Convidado", valor: (l) => (l.reservada_por ? "Sim" : "Não"), largura: 11 },
    { titulo: "Convidado por", valor: (l) => l.convidado_por, largura: 24 },
    { titulo: "Origem", valor: (l) => ROTULO_ORIGEM[l.origem] ?? l.origem },
    ...(evento.exige_rsvp
      ? [{ titulo: "RSVP", valor: (l: LinhaConfirmado) => (l.rsvp_confirmado === true ? "Vem" : l.rsvp_confirmado === false ? "Não vem" : "Sem resposta") }]
      : []),
    { titulo: "Presenças", valor: (l) => l.presencas, largura: 11 },
    { titulo: "Inscrito em", valor: (l) => dataXlsx(l.created_at), largura: 12 },
    ...campos.map((c) => ({ titulo: c.rotulo, valor: (l: LinhaConfirmado) => l.respostas.get(c.id) ?? null, largura: 24 })),
  ]

  const bytes = planilhaXlsx("Confirmados", colunas, linhas)
  return respostaXlsx(`confirmados-${evento.slug || id.slice(0, 8)}`, bytes)
}
