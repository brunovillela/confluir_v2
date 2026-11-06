import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { contarAvisosPendentes } from "@/lib/db/ferias-aviso"
import { regraPagamentoFerias } from "@/lib/db/ferias-regras"

import { RegrasFeriasForm } from "./regras-form"

export const metadata: Metadata = { title: "Regras de férias — Confluir" }

/**
 * Regras de férias da entidade: o prazo e o que é pago, como o acordo
 * coletivo define. O aviso de férias usa só isto (não cita lei).
 */
export default async function RegrasFeriasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; refeitos?: string; falhas?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const sp = await searchParams
  const [regra, pendentes] = await Promise.all([regraPagamentoFerias(), contarAvisosPendentes()])
  const refeitos = Number(sp.refeitos ?? 0)
  const falhas = Number(sp.falhas ?? 0)

  return (
    <>
      <RotuloTrilha valores={{ regras: "Regras de férias" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/ferias">
            <ArrowLeft />
            Férias
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Regras de férias</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O que o acordo coletivo da entidade define para o pagamento das férias. O aviso de férias
          usa só estas regras.
        </p>
      </div>

      {sp.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Regras salvas.
            {refeitos > 0 &&
              ` ${refeitos} aviso${refeitos === 1 ? "" : "s"} que aguardava${refeitos === 1 ? "" : "m"} assinatura ${refeitos === 1 ? "foi refeito e reenviado" : "foram refeitos e reenviados"} com o texto novo.`}
          </AlertDescription>
        </Alert>
      )}
      {falhas > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {falhas} aviso{falhas === 1 ? "" : "s"} não pôde ser reenviado (funcionário sem e-mail ou CPF válido no
            cadastro). Veja a coluna Aviso na área de Férias.
          </AlertDescription>
        </Alert>
      )}

      <RegrasFeriasForm regra={regra} pendentes={pendentes} />
    </>
  )
}
