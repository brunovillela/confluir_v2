import Link from "next/link"

import { GraficoColunas } from "@/components/graficos/colunas"
import { GraficoLinha } from "@/components/graficos/linha"
import { TileIndicador } from "@/components/graficos/tile"
import { compacto, rotuloMes } from "@/components/graficos/base"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { avisoAnalitica } from "@/lib/db/analitica"
import { arrecadacaoDoEmpregador } from "@/lib/db/arrecadacao-empregador"

function delta(atual: number, anterior: number | null): { texto: string; sinal: -1 | 0 | 1 } | null {
  if (anterior === null || anterior === 0) return null
  const d = atual - anterior
  return { texto: `${d > 0 ? "+" : ""}${((d / anterior) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, sinal: d > 0 ? 1 : d < 0 ? -1 : 0 }
}

/** Aba "Arrecadação" da página do empregador (onda 3, I5). */
export async function AbaArrecadacao({ empresaId, nome }: { empresaId: string; nome: string }) {
  const a = await arrecadacaoDoEmpregador(empresaId, 24)
  if (!a.disponivel) {
    return (
      <Alert>
        <AlertDescription>{avisoAnalitica}</AlertDescription>
      </Alert>
    )
  }
  const rotulos = a.meses.map(rotuloMes)
  const cobertura = a.ultimo && a.filiadosAtivos > 0 ? a.ultimo.pagantes / a.filiadosAtivos : null
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador
          rotulo={a.ultimo ? `Arrecadado em ${rotuloMes(a.ultimo.mes)}` : "Arrecadado"}
          valor={a.ultimo ? compacto(a.ultimo.valor, true) : "—"}
          delta={a.ultimo ? delta(a.ultimo.valor, a.anterior?.valor ?? null) : null}
          deltaRotulo={a.anterior ? `vs. ${rotuloMes(a.anterior.mes)}` : undefined}
        />
        <TileIndicador
          rotulo="Pagantes na última remessa"
          valor={a.ultimo ? a.ultimo.pagantes.toLocaleString("pt-BR") : "—"}
          delta={a.ultimo ? delta(a.ultimo.pagantes, a.anterior?.pagantes ?? null) : null}
          deltaRotulo={a.anterior ? `vs. ${rotuloMes(a.anterior.mes)}` : undefined}
        />
        <TileIndicador
          rotulo="Pagantes × filiados ativos"
          valor={cobertura === null ? "—" : `${(cobertura * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
          nota={`${a.filiadosAtivos.toLocaleString("pt-BR")} ativos nesta fonte`}
          href={`/painel/filiados/lista?fonte=${empresaId}&condicao=Ativo&situacao=todas`}
        />
        <TileIndicador
          rotulo="Remessas"
          valor={a.mesesSemRemessa === 0 ? "Em dia" : a.mesesSemRemessa >= 99 ? "Nenhuma" : `${a.mesesSemRemessa} ${a.mesesSemRemessa === 1 ? "mês" : "meses"} sem`}
          nota={a.ultimo ? `última: ${rotuloMes(a.ultimo.mes)}` : "nenhuma remessa registrada"}
          delta={a.mesesSemRemessa > 0 && a.mesesSemRemessa < 99 ? { texto: "em atraso", sinal: -1 } : null}
          href="/painel/filiados/receitas"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Arrecadação mensal por tipo</CardTitle>
            <CardDescription>Valor informado nas remessas de {nome}, por mês de referência, nos últimos 24 meses.</CardDescription>
          </CardHeader>
          <CardContent>
            {a.valorPorTipo.length ? (
              <GraficoColunas categorias={rotulos} series={a.valorPorTipo} empilhado emMoeda titulo={`Arrecadação mensal de ${nome}`} />
            ) : (
              <p className="text-muted-foreground text-sm">Sem remessas desta fonte no período.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pagantes por mês</CardTitle>
            <CardDescription>Pessoas distintas em cada remessa; compare com os filiados ativos na fonte.</CardDescription>
          </CardHeader>
          <CardContent>
            <GraficoLinha categorias={rotulos} valores={a.pagantes} nome="Pagantes" titulo={`Pagantes por mês em ${nome}`} />
          </CardContent>
        </Card>
      </div>
      <p className="text-muted-foreground text-xs">
        Os lançamentos de cada remessa estão em{" "}
        <Link href="/painel/filiados/receitas" className="underline underline-offset-4">
          Receitas
        </Link>
        .
      </p>
    </div>
  )
}
