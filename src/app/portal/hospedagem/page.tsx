import type { Metadata } from "next"

import { SituacaoCupomBadge } from "@/app/painel/hospedagem/situacao-cupom-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { cuponsDoFiliado, hoteisDisponiveis } from "@/lib/db/filiado-portal"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { PortalShell } from "../portal-shell"
import { CancelarMeuCupomBotao, SolicitarCupomForm } from "./cupom-portal"

export const metadata: Metadata = { title: "Hospedagem — Portal do Associado" }

export default async function PortalHospedagemPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; pagina?: string; porPagina?: string }>
}) {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const params = await searchParams
  const { salvo } = params

  const [cupons, hoteis] = await Promise.all([
    cuponsDoFiliado(filiado.cpf),
    hoteisDisponiveis(),
  ])
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())

  // Página concorrida (formulário + lista): 10 por página.
  const paginacao = lerPaginacao(params, 10)
  const paginaAtual = paginar(cupons, paginacao)

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hospedagem</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cupons de hospedagem subsidiada nos hotéis parceiros do sindicato.
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Cupom solicitado! Apresente-se no hotel na data prevista — a reserva
            é confirmada pelo hotel e a retirada do cupom não a garante.
          </AlertDescription>
        </Alert>
      )}

      {!preview && (
        <SolicitarCupomForm
          hoteis={hoteis.map((h) => ({ id: h.id, nome: h.nome }))}
          hoje={hoje}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meus cupons</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Quarto coletivo
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Sua tarifa
                  </TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginaAtual.total === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Você ainda não tem cupons.
                    </TableCell>
                  </TableRow>
                )}
                {paginaAtual.linhas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-48 truncate font-medium">
                      {c.hotelNome ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatarData(c.check_in)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {c.aceita_quarto_coletivo === true ? "Aceita" : "Não"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden tabular-nums sm:table-cell">
                      {c.tarifa_hospede === null
                        ? "—"
                        : c.tarifa_hospede.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                    </TableCell>
                    <TableCell>
                      <SituacaoCupomBadge
                        cancelado={c.cancelado}
                        servicoId={c.servico_id}
                      />
                    </TableCell>
                    <TableCell>
                      {!preview && c.situacao === "aguardando" && (
                        <CancelarMeuCupomBotao id={c.id} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4">
            <Paginacao
              total={paginaAtual.total}
              pagina={paginaAtual.pagina}
              totalPaginas={paginaAtual.totalPaginas}
              porPagina={paginacao.porPagina}
              padrao={10}
            />
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            A tarifa aparece quando o hotel confirma a reserva, conforme a
            quantidade de pessoas no quarto. Os valores já incluem os impostos e
            a sua parte é paga no hotel, na entrada.
          </p>
        </CardContent>
      </Card>
    </PortalShell>
  )
}
