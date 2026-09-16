import Link from "next/link"
import { ArrowUpRight, CopyCheck } from "lucide-react"

import {
  faixaDaSaude,
  MedidorSaudeCadastros,
  percentualSaude,
} from "@/components/medidor-saude-cadastros"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import { listarDuplicidades } from "@/lib/db/filiacao-duplicidades"

/** Cartão "Saúde dos cadastros": completos ÷ ativos, com atalho para os pendentes e as duplicidades. */
export async function SaudeCadastros() {
  const [{ ativos, linhas }, duplicidades] = await Promise.all([
    cadastrosPendentes(),
    listarDuplicidades(),
  ])
  const gruposDuplicados = duplicidades.disponivel ? duplicidades.grupos.length : 0
  const completos = ativos - linhas.length
  const percentual = percentualSaude(completos, ativos)
  const faixa = faixaDaSaude(percentual)

  return (
    <Card className="h-full">
      <CabecalhoSaude />
      <CardContent className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-3xl font-semibold tabular-nums">
            {percentual.toLocaleString("pt-BR")}%
          </span>
          <Badge variant="outline" className={faixa.classeBadge}>
            {faixa.rotulo}
          </Badge>
        </div>
        <MedidorSaudeCadastros percentual={percentual} />
        <p className="text-muted-foreground text-center text-xs">
          <span className="tabular-nums">{completos.toLocaleString("pt-BR")}</span> de{" "}
          <span className="tabular-nums">{ativos.toLocaleString("pt-BR")}</span> cadastros
          ativos completos ·{" "}
          <Link
            href="/painel/filiados/cadastros-pendentes"
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            <span className="tabular-nums">{linhas.length.toLocaleString("pt-BR")}</span> com pendência
          </Link>
        </p>
        {gruposDuplicados > 0 && (
          <Link
            href="/painel/filiados/duplicidades"
            className="border-warning/40 bg-warning/10 hover:bg-warning/15 text-warning-fg mt-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
          >
            <CopyCheck className="size-4" />
            <span>
              <span className="tabular-nums">{gruposDuplicados.toLocaleString("pt-BR")}</span>{" "}
              {gruposDuplicados === 1 ? "possível duplicidade" : "possíveis duplicidades"} para conferir
            </span>
            <ArrowUpRight className="size-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

function CabecalhoSaude() {
  return (
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div>
          <CardTitle className="text-base whitespace-nowrap">Saúde dos cadastros</CardTitle>
          <CardDescription>Filiados ativos sem nenhuma pendência</CardDescription>
        </div>
        <Link
          href="/painel/filiados/cadastros-pendentes"
          className="text-primary inline-flex shrink-0 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          Cadastros pendentes
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </CardHeader>
  )
}

/** Enquanto a varredura roda (cache de 10 min expirado), a página já abre. */
export function SaudeCadastrosCarregando() {
  return (
    <Card className="h-full">
      <CabecalhoSaude />
      <CardContent className="grid gap-3">
        <div className="bg-muted h-9 w-32 animate-pulse rounded-md" />
        <div className="bg-muted mx-auto aspect-[26/15] w-full max-w-72 animate-pulse rounded-t-full" />
        <p className="text-muted-foreground text-center text-xs">Apurando os cadastros…</p>
      </CardContent>
    </Card>
  )
}
