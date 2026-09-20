import Link from "next/link"
import { HandCoins } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SituacaoDiariaBadge } from "@/components/diarias"
import { listarSolicitacoesDiaria } from "@/lib/db/diarias"
import { formatarData, formatarMoeda } from "@/lib/formato"

/**
 * As diárias DAQUELE diretor, dentro da ficha dele — a sub-área pedida pelo
 * Bruno. A lista geral fica em Diretoria → Diárias.
 */
export async function DiariasDoIntegrante({
  usuarioId,
  nome,
}: {
  usuarioId: string
  nome: string | null
}) {
  const { solicitacoes } = await listarSolicitacoesDiaria({
    quadro: "diretor",
    beneficiarioId: usuarioId,
  })
  const ano = new Date().getFullYear()
  const aprovadasAno = solicitacoes.filter(
    (s) =>
      s.situacao === "aprovada" &&
      Number((s.data_inicio ?? s.created_at ?? "").slice(0, 4)) === ano
  )
  const totalAno = aprovadasAno.reduce(
    (t, s) => t + (s.valor_total ?? 0) + s.valorDespesas,
    0
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HandCoins className="size-4" />
          Diárias
        </CardTitle>
        <CardDescription>
          {solicitacoes.length === 0
            ? `Nenhuma diária lançada para ${nome?.split(" ")[0] ?? "este diretor"}.`
            : `${solicitacoes.length.toLocaleString("pt-BR")} no total · ${formatarMoeda(totalAno)} aprovados em ${ano} (com despesas)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {solicitacoes.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {solicitacoes.slice(0, 8).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/painel/institucional/diretoria/diarias/${s.id}`}
                  className="min-w-0 hover:underline"
                >
                  <span className="truncate">{s.tipoNome ?? "Diária"}</span>
                  {s.data_inicio && (
                    <span className="text-muted-foreground"> · {formatarData(s.data_inicio)}</span>
                  )}
                </Link>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">
                    {formatarMoeda((s.valor_total ?? 0) + s.valorDespesas)}
                  </span>
                  <SituacaoDiariaBadge situacao={s.situacao} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/painel/institucional/diretoria/diarias?busca=${encodeURIComponent(nome ?? "")}`}>
              Ver todas as diárias
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
