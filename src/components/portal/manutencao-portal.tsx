import Link from "next/link"
import { ArrowRight, Construction, Settings2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CanaisDoSindicato } from "@/lib/db/sindicato-portal"

import { CanaisDaEntidade } from "./canais-da-entidade"
import { HREF_AREA_DO_ASSOCIADO } from "./guarda-parte"

/**
 * O portal inteiro fora do ar (Filiados › Área do associado › Portal inteiro
 * desabilitado), para quem já estava dentro: no lugar do conteúdo, o motivo
 * e a volta prevista, os canais oficiais da entidade e o que continua aberto
 * (direitos com prazo, LGPD, desligar avisos, cancelar reservas de hospedagem
 * e inscrições em eventos). "Sair" fica no cabeçalho.
 * No "Ver como filiado", a mesma página e a nota da gestão.
 */
export function ManutencaoPortal({
  mensagem,
  canais,
  abertos,
  preview = false,
}: {
  /** mensagemDaSituacao("portal", …): a da gestão ou a padrão, com a previsão. */
  mensagem: string
  canais: CanaisDoSindicato | null
  /** O que continua abrindo (sem a Oposição para quem não tem a ver com ela). */
  abertos: readonly { href: string; titulo: string }[]
  preview?: boolean
}) {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="grid justify-items-center gap-3 pt-2 text-center">
        <div className="bg-muted flex size-14 items-center justify-center rounded-full">
          <Construction className="text-muted-foreground size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Portal temporariamente indisponível</h1>
        <p className="text-muted-foreground max-w-prose text-sm text-balance">{mensagem}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Fale com o sindicato
          </CardTitle>
          <CardDescription>Enquanto o portal está fora do ar, use os canais oficiais da entidade.</CardDescription>
        </CardHeader>
        <CardContent>
          <CanaisDaEntidade canais={canais} />
        </CardContent>
      </Card>

      {abertos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Continua disponível
            </CardTitle>
            <CardDescription>
              O que tem prazo, as suas escolhas sobre dados e avisos e o cancelamento do que você já
              pediu não param com o portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {abertos.map((a) => (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3"
                  >
                    <span className="min-w-0">{a.titulo}</span>
                    <ArrowRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {preview && (
        <p className="text-muted-foreground flex flex-wrap items-center justify-center gap-1 text-center text-xs">
          <Settings2 aria-hidden className="size-3.5" />
          Visível só para a gestão: o portal inteiro está desabilitado em{" "}
          <Link href={`${HREF_AREA_DO_ASSOCIADO}#parte-portal`} className="underline underline-offset-2">
            Filiados › Área do associado
          </Link>
          . O associado vê esta mesma página.
        </p>
      )}
    </div>
  )
}
