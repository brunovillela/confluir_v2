import type { Metadata } from "next"
import { HeartPulse, Info } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
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
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { meusAtendimentos } from "@/lib/db/atendimentos"
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { PortalShell } from "../portal-shell"

export const metadata: Metadata = { title: "Saúde — Portal do Associado" }

export default async function PortalSaudePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sessao = await requireVisualizacaoPortal()

  // O CPF se repete em vários registros de filiação (~2,9× por pessoa), e o
  // assistido pode estar ligado a qualquer um deles.
  const filiadoIds = await registrosDoCpf(sessao.filiado.cpf)
  const { linhas, disponivel } = await meusAtendimentos(filiadoIds)

  const p = await searchParams
  const pag = lerPaginacao(p, 10)
  const { linhas: pagina, ...info } = paginar(linhas, pag)

  return (
    <PortalShell preview={sessao.preview ? { filiadoNome: sessao.filiado.nome_completo, gestorNome: sessao.gestorNome } : undefined}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Saúde</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Seus atendimentos no serviço de saúde do sindicato
        </p>
      </div>

      {!disponivel ? (
        <Alert>
          <Info />
          <AlertDescription>
            O histórico de atendimentos ainda não está disponível.
          </AlertDescription>
        </Alert>
      ) : linhas.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-8 text-center text-sm">
              <HeartPulse className="mx-auto mb-2 size-5" />
              Você não tem atendimentos registrados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Histórico de atendimentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagina.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatarData(a.data_atendimento)}
                      </TableCell>
                      <TableCell>{a.tipoNome ?? "—"}</TableCell>
                      <TableCell>{a.profissionalNome ?? "—"}</TableCell>
                      <TableCell className="max-w-md">
                        <span className="whitespace-pre-line">
                          {a.observacao_aberta ?? "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Paginacao {...info} porPagina={pag.porPagina} padrao={10} />
            </CardContent>
          </Card>

          <Alert>
            <Info />
            <AlertDescription>
              Esta página mostra o registro administrativo dos seus
              atendimentos. O relatório clínico fica sob guarda do
              profissional que o elaborou — para ter acesso a ele, fale com o
              serviço de saúde do sindicato.
            </AlertDescription>
          </Alert>
        </>
      )}
    </PortalShell>
  )
}
