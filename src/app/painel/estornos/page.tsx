import type { Metadata } from "next"
import Link from "next/link"
import { Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { listarEstornos } from "@/lib/db/ordens-estorno"

import { ehFinanceiro } from "./acesso"
import { TabelaEstornos } from "./tabela-estornos"

export const metadata: Metadata = { title: "Meus estornos — Confluir" }

/** Estornos das ordens que o usuário lançou — ele confere e reencaminha. */
export default async function MeusEstornosPage() {
  const sessao = await requireSessaoPainel()
  const { estornos } = await listarEstornos({ situacao: "todos", responsavelId: sessao.usuario.id })
  const pendentes = estornos.filter((e) => !e.resolvidoEm).length

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meus estornos</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Pagamentos de ordens que você lançou e que o banco devolveu.{" "}
            {pendentes > 0
              ? `${pendentes} aguardando você conferir os dados e reencaminhar.`
              : "Nada pendente."}
          </p>
        </div>
        {ehFinanceiro(sessao) && (
          <Button variant="outline" asChild>
            <Link href="/painel/financeiro/estornos">Todos os estornos</Link>
          </Button>
        )}
      </div>
      <Card>
        <CardContent>
          {estornos.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
              <Undo2 className="size-6" />
              Nenhum estorno em ordens lançadas por você.
            </div>
          ) : (
            <TabelaEstornos estornos={estornos} mostrarResponsavel={false} />
          )}
        </CardContent>
      </Card>
    </>
  )
}
