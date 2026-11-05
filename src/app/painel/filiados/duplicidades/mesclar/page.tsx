import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { fichasParaMesclar } from "@/lib/db/filiacao-duplicidades"

import { MesclarForm } from "./mesclar-form"

export const metadata: Metadata = { title: "Mesclar cadastros — Confluir" }

export default async function MesclarPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>
}) {
  await requirePermissao("filiacao_gestao")
  const { ids = "" } = await searchParams
  const fichas = await fichasParaMesclar(ids.split(",").filter(Boolean))

  // Principal sugerido: o que carrega mais histórico; empate → ativo → mais antigo.
  const peso = (f: (typeof fichas)[number]) => f.vinculos.length + f.contagens.contribuicoes + f.contagens.prontuario
  const sugerido = [...fichas].sort(
    (a, b) =>
      peso(b) - peso(a) ||
      Number(b.valores.filiacao_condicao === "Ativo") - Number(a.valores.filiacao_condicao === "Ativo") ||
      (a.criadoEm ?? "").localeCompare(b.criadoEm ?? "")
  )[0]

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados/duplicidades">
            <ArrowLeft />
            Possíveis duplicidades
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Mesclar cadastros</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Os cadastros lado a lado: clique no valor que fica e veja, na última coluna, como o cadastro vai ficar.
        </p>
      </div>

      {fichas.length < 2 || !sugerido ? (
        <Alert>
          <AlertDescription>
            Escolha ao menos dois cadastros não excluídos na lista de possíveis duplicidades.
          </AlertDescription>
        </Alert>
      ) : (
        <MesclarForm fichas={fichas} sugerido={sugerido.id} />
      )}
    </>
  )
}
