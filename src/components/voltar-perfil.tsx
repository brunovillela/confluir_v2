import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"

/** O "voltar" de toda página do Meu perfil: leva ao hub do perfil. */
export function VoltarPerfil({ href = "/painel/perfil", rotulo = "Meu perfil" }: { href?: string; rotulo?: string }) {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 self-start">
      <Link href={href}>
        <ArrowLeft />
        {rotulo}
      </Link>
    </Button>
  )
}
