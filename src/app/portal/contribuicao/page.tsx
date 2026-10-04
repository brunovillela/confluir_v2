import type { Metadata } from "next"
import { Coins, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { minhaContribuicao } from "@/lib/db/carteirinha"
import { cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { formatarMoeda } from "@/lib/formato"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PortalShell } from "../portal-shell"

export const metadata: Metadata = { title: "Minha contribuição — Portal" }

/** Minha contribuição (onda 4, F6): descontos por mês e fonte, última remessa e avisos. */
export default async function ContribuicaoPage() {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const cadastro = await cadastroDoFiliado(filiado.cpf)
  const c = cadastro ? await minhaContribuicao(filiado.cpf, cadastro.id) : null
  const ultimas = c?.linhas.slice(0, 36) ?? []

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
      <div>
        <div className="flex items-center gap-2">
          <Coins className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Minha contribuição</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          O que foi descontado e repassado ao sindicato, mês a mês, conforme as remessas das fontes pagadoras.
        </p>
      </div>

      {!c ? (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível carregar suas contribuições — fale com o sindicato.</AlertDescription>
        </Alert>
      ) : (
        <>
          {c.inadimplente ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>
                Pela regra da entidade, sua contribuição consta como <strong>em atraso</strong>. Isso pode suspender benefícios. Se o desconto está sendo feito, procure o sindicato com o contracheque para regularizar.
              </AlertDescription>
            </Alert>
          ) : c.emFalta.length > 0 ? (
            <Alert>
              <TriangleAlert />
              <AlertDescription>
                Não encontramos sua contribuição em {c.emFalta.length === 1 ? "uma remessa recente" : `${c.emFalta.length} remessas recentes`} ({c.emFalta.join(", ")}).
                {c.toleradas !== null && ` A regra da entidade tolera até ${c.toleradas} ${c.toleradas === 1 ? "falta" : "faltas"} antes de considerar inadimplência.`}{" "}
                Se o desconto apareceu no seu contracheque, avise o sindicato.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-muted-foreground text-xs">Últimos 12 meses</p>
                <p className="mt-1 text-2xl font-semibold">{formatarMoeda(c.total12m)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-muted-foreground text-xs">Última contribuição</p>
                <p className="mt-1 text-2xl font-semibold">{c.ultima ? formatarMoeda(c.ultima.valor) : "—"}</p>
                {c.ultima && <p className="text-muted-foreground text-xs">{c.ultima.competencia} · {c.ultima.fonte ?? "fonte não informada"}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-muted-foreground text-xs">Situação</p>
                <p className="mt-1">
                  <Badge variant="outline" className={c.inadimplente ? "border-destructive/40 text-destructive" : c.emFalta.length ? "border-warning/40 text-warning-fg" : "border-success/40 text-success-fg"}>
                    {c.inadimplente ? "Em atraso" : c.emFalta.length ? "Com faltas recentes" : "Em dia"}
                  </Badge>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Histórico</CardTitle>
              <CardDescription>{c.linhas.length === 0 ? "Nenhuma contribuição registrada ainda." : `${c.linhas.length} lançamentos; os ${ultimas.length} mais recentes abaixo.`}</CardDescription>
            </CardHeader>
            {ultimas.length > 0 && (
              <CardContent>
                <Table className="tabela-cards">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Competência</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fonte pagadora</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ultimas.map((l, i) => (
                      <TableRow key={`${l.ordem}-${l.tipo}-${i}`}>
                        <TableCell data-rotulo="Competência" className="tabular-nums">{l.competencia}</TableCell>
                        <TableCell data-rotulo="Tipo">{l.tipo ?? "—"}</TableCell>
                        <TableCell data-rotulo="Fonte pagadora">{l.fonte ?? "—"}</TableCell>
                        <TableCell data-rotulo="Valor" className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </PortalShell>
  )
}
