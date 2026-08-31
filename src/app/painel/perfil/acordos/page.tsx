import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Download, Handshake } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { acordosParaMeuPerfil } from "@/lib/db/acordos"
import { estadoVigencia } from "@/lib/acordos-constantes"
import { hojeSP } from "@/lib/db/comum"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Acordos coletivos — Confluir" }

/**
 * Autosserviço: os ACTs do sindicato com os PRÓPRIOS funcionários, marcados
 * pela Representação. Vencidos continuam aqui (com o aviso) enquanto a
 * situação for "Vigente" — saem só quando arquivados (não vigentes).
 */
export default async function MeusAcordosPage() {
  await requireSessaoPainel()
  const acordos = await acordosParaMeuPerfil()
  const hoje = hojeSP()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/perfil">
            <ArrowLeft />
            Meu perfil
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Acordos coletivos de trabalho
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Os ACTs entre o sindicato e os seus funcionários. Acordos vencidos
          continuam valendo até a assinatura do próximo — por isso seguem
          disponíveis aqui.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Instrumentos disponíveis</CardTitle>
            <Handshake className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {acordos.length} acordo{acordos.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {acordos.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nenhum acordo disponibilizado no momento.
            </p>
          ) : (
            <ul className="divide-y">
              {acordos.map((a) => {
                const estado = estadoVigencia(a.vigencia_fim, hoje)
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {a.titulo ?? "(sem título)"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Vigência{" "}
                        {a.vigencia_inicio
                          ? formatarData(a.vigencia_inicio)
                          : "—"}{" "}
                        a {a.vigencia_fim ? formatarData(a.vigencia_fim) : "—"}
                        {a.data_base ? ` · data-base ${a.data_base}` : ""}
                      </p>
                    </div>
                    {estado === "vencido" ? (
                      <Badge
                        variant="outline"
                        className="border-warning/40 text-warning-fg"
                        title="A vigência formal terminou, mas o acordo segue valendo até o próximo ser assinado."
                      >
                        Vigência vencida
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-success/40 text-success-fg"
                      >
                        Vigente
                      </Badge>
                    )}
                    {a.documentoUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={a.documentoUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="size-3.5" />
                          Baixar PDF
                        </a>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        sem arquivo
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
