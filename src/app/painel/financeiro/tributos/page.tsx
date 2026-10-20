import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Landmark } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { rotuloCentroCusto } from "@/lib/centros-custo-rotulo"
import { listarDepartamentos, listarFornecedores } from "@/lib/db/compras"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import { AVISO_SQL_TRIBUTOS, garantirGuiasPrevistas, listarTributos } from "@/lib/db/tributos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { hojeSP } from "@/lib/db/comum"
import { rotuloEsfera, rotuloPeriodicidade } from "@/lib/tributos-constantes"

import { TributoDialog } from "./tributo-forms"

export const metadata: Metadata = { title: "Tributos — Confluir" }

export default async function TributosPage() {
  const sessao = await requirePermissao("financeiro_tributos", ["financeiro_leitura"])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_tributos")
  // As guias previstas dos tributos mensais se completam ao abrir a área.
  await garantirGuiasPrevistas().catch(() => 0)
  const [{ disponivel, tributos }, orgaos, centros, departamentos] = await Promise.all([
    listarTributos(),
    podeEditar ? listarFornecedores() : Promise.resolve([]),
    podeEditar ? listarCentrosCusto() : Promise.resolve([]),
    podeEditar ? listarDepartamentos() : Promise.resolve([]),
  ])
  const hoje = hojeSP()
  const ativos = tributos.filter((t) => t.ativo)
  const aVencer = ativos.filter((t) => t.proxima?.vencimento)
  const atrasadas = aVencer.filter((t) => (t.proxima!.vencimento as string) < hoje).length

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro">
            <ArrowLeft />
            Financeiro
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Tributos</h1>
          <Landmark className="text-muted-foreground size-5" />
          {disponivel && podeEditar && (
            <div className="ml-auto">
              <TributoDialog
                orgaos={orgaos}
                centros={centros.filter((c) => c.usavel !== false).map((c) => ({ id: c.id, rotulo: rotuloCentroCusto(c) }))}
                departamentos={departamentos.map((d) => ({ id: d.id, rotulo: d.nome }))}
              />
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          DARF, FGTS, GPS, IPTU, alvarás, DUDA… Cada tributo tem as guias por competência, como o contrato tem as
          parcelas; a guia lançada gera a ordem de pagamento. Os mensais já trazem as próximas guias previstas.
        </p>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_TRIBUTOS}</AlertDescription>
        </Alert>
      )}
      {disponivel && atrasadas > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {atrasadas} tributo(s) com guia prevista vencida e ainda não lançada. Lance a guia ou cancele a prevista
            que não se aplica.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Tributo</TableHead>
                <TableHead className="hidden md:table-cell">Órgão</TableHead>
                <TableHead>Próxima guia</TableHead>
                <TableHead className="hidden lg:table-cell">Última lançada</TableHead>
                <TableHead className="text-right">Pago no ano</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tributos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24">
                    <p className="text-muted-foreground text-center text-sm">Nenhum tributo cadastrado.</p>
                  </TableCell>
                </TableRow>
              )}
              {tributos.map((t) => {
                const venc = t.proxima?.vencimento ?? null
                const vencida = venc !== null && venc < hoje
                return (
                  <TableRow key={t.id} className={t.ativo ? "" : "opacity-60"}>
                    <TableCell>
                      <Link href={`/painel/financeiro/tributos/${t.id}`} className="font-medium hover:underline">
                        {t.abreviacao ?? t.nome}
                      </Link>
                      {!t.ativo && <Badge variant="secondary" className="ml-2">Desativado</Badge>}
                      <span className="text-muted-foreground block text-xs">
                        {rotuloEsfera(t.esfera)} · {rotuloPeriodicidade(t.periodicidade)}
                        {t.abreviacao && t.abreviacao !== t.nome ? ` · ${t.nome}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{t.beneficiario ?? "—"}</TableCell>
                    <TableCell>
                      {t.proxima ? (
                        <>
                          <span className={vencida ? "text-destructive font-medium" : ""}>
                            {venc ? formatarData(venc) : "—"}
                          </span>
                          <span className="text-muted-foreground block text-xs">
                            competência {t.proxima.competencia}
                            {t.guiasAguardando > 1 ? ` · +${t.guiasAguardando - 1} prevista(s)` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {t.periodicidade === "mensal" ? "—" : "Lançada quando chega"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {t.ultimaLancada ? (
                        <>
                          {t.ultimaLancada.valor != null ? formatarMoeda(t.ultimaLancada.valor) : "—"}
                          <span className="text-muted-foreground block text-xs">
                            competência {t.ultimaLancada.competencia} · {t.ultimaLancada.ordemSituacao ?? "—"}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(t.pagoNoAno)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
