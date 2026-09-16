import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { CAMPOS_MESCLAGEM, cadastrosParaMesclar } from "@/lib/db/filiacao-duplicidades"

import { MesclarForm } from "./mesclar-form"

export const metadata: Metadata = { title: "Mesclar cadastros — Confluir" }

export default async function MesclarPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>
}) {
  await requirePermissao("filiacao_gestao")
  const { ids = "" } = await searchParams
  const cadastros = await cadastrosParaMesclar(ids.split(",").filter(Boolean))

  // Principal sugerido: o que carrega mais histórico; empate → ativo → mais antigo.
  const peso = (c: (typeof cadastros)[number]) => c.vinculos + c.contribuicoes + c.prontuario
  const sugerido = [...cadastros].sort(
    (a, b) =>
      peso(b) - peso(a) ||
      Number(b.condicao === "Ativo") - Number(a.condicao === "Ativo") ||
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
          Junta cadastros da mesma pessoa num só, com todo o histórico.
        </p>
      </div>

      {cadastros.length < 2 || !sugerido ? (
        <Alert>
          <AlertDescription>
            Escolha ao menos dois cadastros não excluídos na lista de possíveis duplicidades.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="max-w-4xl">
          <MesclarForm
            cadastros={cadastros}
            campos={CAMPOS_MESCLAGEM.map((c) => ({ campo: c.campo, rotulo: c.rotulo }))}
            sugerido={sugerido.id}
          />
        </div>
      )}
    </>
  )
}
