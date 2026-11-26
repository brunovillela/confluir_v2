import { requirePermissao } from "@/lib/auth"
import { obterEvento, SITUACOES_INSCRICAO } from "@/lib/db/eventos"
import { relacaoDeConfirmados, type LinhaConfirmado } from "@/lib/db/eventos-relacao"
import { cpfParcial, descreverRecorte, lerOpcoesRelacao } from "@/lib/eventos-relacao-opcoes"
import { registrarExportacao } from "@/lib/exportacoes"
import { formatarCnpjCpf, formatarData, formatarTelefone } from "@/lib/formato"
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
 * formatado: número no Excel come o zero à esquerda. O recorte (quem, lista de
 * espera, CPF parcial, sem contato) vem da URL — ver `eventos-relacao-opcoes`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePermissao("eventos_gestao")
  const { id } = await params
  const evento = await obterEvento(id)
  if (!evento) return new Response("Não encontrado", { status: 404 })

  const opcoes = lerOpcoesRelacao(new URL(request.url).searchParams)
  const { campos, linhas, dias, diaEscolhido } = await relacaoDeConfirmados(id, opcoes)
  const rotuloDia = (d: (typeof dias)[number]) => `${formatarData(d.data)}${d.rotulo ? ` — ${d.rotulo}` : ""}`
  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "eventos_confirmados",
    formato: "xlsx",
    quantidade: linhas.length,
    filtros: { evento: evento.titulo ?? id, recorte: descreverRecorte(opcoes, diaEscolhido ? rotuloDia(diaEscolhido) : null) },
  })

  const cpf = (l: LinhaConfirmado) => (opcoes.cpfParcial ? cpfParcial(l.cpf) : l.cpf ? formatarCnpjCpf(l.cpf) : null)
  const colunas: ColunaXlsx<LinhaConfirmado>[] = [
    { titulo: "Nome", valor: (l) => l.nome, largura: 36 },
    { titulo: "CPF", valor: cpf, largura: 16 },
    ...(opcoes.contato
      ? [
          { titulo: "E-mail", valor: (l: LinhaConfirmado) => l.email, largura: 32 },
          { titulo: "Telefone", valor: (l: LinhaConfirmado) => (l.telefone ? formatarTelefone(l.telefone) : null), largura: 16 },
        ]
      : []),
    // Com a lista de espera, ou em "quem veio" (que entra em qualquer situação).
    ...(opcoes.espera || opcoes.presenca === "presentes"
      ? [
          {
            titulo: "Situação",
            valor: (l: LinhaConfirmado) => SITUACOES_INSCRICAO.find((x) => x.valor === l.situacao)?.rotulo ?? l.situacao,
            largura: 16,
          },
        ]
      : []),
    { titulo: "Filiado", valor: (l) => (l.filiacao_id ? "Sim" : "Não"), largura: 9 },
    { titulo: "Convidado", valor: (l) => (l.reservada_por ? "Sim" : "Não"), largura: 11 },
    { titulo: "Convidado por", valor: (l) => l.convidado_por, largura: 24 },
    { titulo: "Origem", valor: (l) => ROTULO_ORIGEM[l.origem] ?? l.origem },
    ...(evento.exige_rsvp
      ? [{ titulo: "RSVP", valor: (l: LinhaConfirmado) => (l.rsvp_confirmado === true ? "Vem" : l.rsvp_confirmado === false ? "Não vem" : "Sem resposta") }]
      : []),
    { titulo: "Presenças", valor: (l) => l.presencas, largura: 11 },
    // Uma coluna por dia do evento: quem passou pela porta em cada um.
    ...dias.map((d) => ({
      titulo: `Presente ${rotuloDia(d)}`,
      valor: (l: LinhaConfirmado) => (l.diasPresente.has(d.id) ? "Sim" : "Não"),
      largura: 14,
    })),
    { titulo: "Inscrito em", valor: (l) => dataXlsx(l.created_at), largura: 12 },
    ...campos.map((c) => ({ titulo: c.rotulo, valor: (l: LinhaConfirmado) => l.respostas.get(c.id) ?? null, largura: 24 })),
  ]

  const sufixo = opcoes.quem === "todos" ? "" : `${opcoes.quem.replace("_", "-")}-`
  const aba =
    opcoes.presenca === "presentes" ? "Presentes" : opcoes.presenca === "ausentes" ? "Faltaram" : opcoes.espera ? "Confirmados e espera" : "Confirmados"
  const prefixo = opcoes.presenca === "presentes" ? "presentes" : opcoes.presenca === "ausentes" ? "faltaram" : "confirmados"
  const bytes = planilhaXlsx(aba, colunas, linhas)
  return respostaXlsx(`${prefixo}-${sufixo}${evento.slug || id.slice(0, 8)}`, bytes)
}
