import type { Metadata } from "next"
import Link from "next/link"
import { ShieldX } from "lucide-react"

import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Sem acesso — Confluir" }

export default function SemAcessoPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="bg-muted flex size-14 items-center justify-center rounded-full">
        <ShieldX className="text-muted-foreground size-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Você não tem acesso a esta área
        </h1>
        <p className="text-muted-foreground max-w-md text-sm text-balance">
          Seu perfil não possui permissão para este módulo. Se você acredita
          que deveria ter acesso, fale com a administração do sistema.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/painel">Voltar ao painel</Link>
      </Button>
    </div>
  )
}
