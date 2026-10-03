import type { Metadata } from "next"
import Link from "next/link"
import { SearchX } from "lucide-react"

import { AuthShell } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Página não encontrada — Confluir" }

/**
 * 404 em português, com caminho de volta. Antes, as 139 chamadas a
 * `notFound()` caíam na tela padrão do Next, em inglês e sem identidade.
 */
export default function NaoEncontrada() {
  return (
    <AuthShell>
      <div className="bg-background rounded-xl border p-8 text-center shadow-sm">
        <SearchX className="text-muted-foreground mx-auto mb-4 size-8" />
        <h1 className="text-xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="text-muted-foreground mt-2 text-sm text-balance">
          O endereço não existe, foi removido ou o link que você recebeu já não vale. Confira o
          link ou volte para a sua área.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/painel">Painel interno</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/portal">Portal do associado</Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  )
}
