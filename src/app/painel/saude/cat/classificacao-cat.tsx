import Link from "next/link"
import { CircleCheck, Copy, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { ROTULO_CLASSE, type ClassificacaoCat } from "@/lib/cat-classificacao"
import { formatarData } from "@/lib/formato"

const ESTILO = {
  nova: { variant: "success", Icone: CircleCheck },
  duplicada: { variant: "destructive", Icone: Copy },
  atualizacao: { variant: "info", Icone: RefreshCw },
  possivel_duplicada: { variant: "warning", Icone: TriangleAlert },
} as const

/** Resultado da comparação com a base: nova, já lançada, atualização ou possível duplicidade. */
export function ClassificacaoCatAviso({
  classificacao,
  children,
}: {
  classificacao: ClassificacaoCat
  children?: React.ReactNode
}) {
  const { variant, Icone } = ESTILO[classificacao.classe]
  const c = classificacao
  return (
    <Alert variant={variant}>
      <Icone />
      <AlertDescription>
        <div className="grid gap-2">
          <p>
            <strong>{ROTULO_CLASSE[c.classe]}.</strong> {c.motivo}
          </p>
          {c.mudancas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs">O que muda:</span>
              {c.mudancas.map((m) => (
                <Badge key={m} variant="outline" className="bg-background font-normal">
                  {m}
                </Badge>
              ))}
            </div>
          )}
          {c.avisos.map((a) => (
            <p key={a} className="text-xs font-medium">
              ⚠ {a}
            </p>
          ))}
          {c.relacionadas.length > 0 && (
            <ul className="grid gap-1 text-xs">
              {c.relacionadas.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-2">
                  <Link
                    href={`/painel/saude/cat/${r.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 font-medium tabular-nums underline-offset-2 hover:underline"
                  >
                    {r.numero ?? "CAT sem número"}
                    <ExternalLink className="size-3" />
                  </Link>
                  <span>
                    {r.nome ?? "acidentado não informado"}
                    {r.dataAcidente ? ` · acidente em ${formatarData(r.dataAcidente)}` : ""}
                    {r.tipo ? ` · ${r.tipo}` : ""}
                    {r.houveMorte ? " · óbito" : ""}
                    {r.id === c.origemId ? " · CAT de origem" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {children}
        </div>
      </AlertDescription>
    </Alert>
  )
}
