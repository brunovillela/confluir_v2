import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * Aviso curto de privacidade para as páginas públicas que coletam dados
 * (ficha de filiação, votação, inscrição em evento, oposição, login…). Aponta
 * para a política da entidade em /privacidade (Onda B6, LGPD art. 9º).
 */
export function AvisoPrivacidade({ className }: { className?: string }) {
  return (
    <p className={cn("text-muted-foreground mt-6 text-center text-xs", className)}>
      Seus dados são tratados pela entidade conforme a{" "}
      <Link href="/privacidade" className="text-foreground underline underline-offset-4">
        política de privacidade
      </Link>{" "}
      (LGPD).
    </p>
  )
}
