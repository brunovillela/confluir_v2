import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { ORIGENS_ORDEM, type OrigemOrdem } from "@/lib/auditoria-regras-catalogo"
import { regrasConfiguradas } from "@/lib/db/auditoria-regras"
import { cn } from "@/lib/utils"

import { RegrasForm, type RegraTela } from "./regras-form"

export const metadata: Metadata = { title: "Auditoria das ordens — Confluir" }

export default async function AuditoriaOrdensPage({
  searchParams,
}: {
  searchParams: Promise<{ origem?: string }>
}) {
  await requirePermissao("financeiro_auditoria")
  const sp = await searchParams
  const origem = (ORIGENS_ORDEM.find((o) => o.chave === sp.origem)?.chave ?? "compras") as OrigemOrdem
  const info = ORIGENS_ORDEM.find((o) => o.chave === origem)!
  const configuradas = await regrasConfiguradas(origem)

  const regras: RegraTela[] = configuradas.map((c) => ({
    codigo: c.regra.codigo,
    titulo: c.regra.titulo,
    pergunta: c.regra.pergunta,
    explicacao: c.regra.explicacao,
    ia: c.regra.ia === true,
    severidade: c.severidade,
    personalizada: c.personalizada,
    parametros: (c.regra.parametros ?? []).map((p) => ({
      chave: p.chave,
      rotulo: p.rotulo,
      tipo: p.tipo,
      ajuda: p.ajuda,
      valor: c.parametros[p.chave] ?? p.padrao,
    })),
  }))

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
          <h1 className="text-2xl font-semibold tracking-tight">Auditoria das ordens</h1>
          <ShieldCheck className="text-muted-foreground size-5" />
        </div>
        <p className="text-muted-foreground mt-1 max-w-3xl text-xs">
          O que o sistema confere ANTES de criar cada ordem de pagamento, por origem.
          Para cada regra, escolha se a situação é aceita, aceita com alerta (a ordem
          é criada e o alerta fica registrado nela, à vista de quem autoriza) ou
          bloqueada (a ordem não é criada e quem a gerou recebe o motivo).
        </p>
      </div>

      <nav aria-label="Origens das ordens" className="flex flex-wrap gap-2">
        {ORIGENS_ORDEM.map((o) => (
          <Button key={o.chave} asChild size="sm" variant={o.chave === origem ? "default" : "outline"}>
            <Link href={`/painel/financeiro/auditoria?origem=${o.chave}`} aria-current={o.chave === origem ? "page" : undefined}>
              {o.rotulo}
            </Link>
          </Button>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{info.rotulo}</CardTitle>
          <CardDescription>{info.descricao}</CardDescription>
        </CardHeader>
        <CardContent className={cn("grid gap-4")}>
          <RegrasForm key={origem} origem={origem} regras={regras} />
        </CardContent>
      </Card>
    </>
  )
}
