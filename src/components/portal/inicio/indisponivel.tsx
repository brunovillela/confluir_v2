import { CloudAlert } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Bloco que não carregou (A187): uma linha discreta no lugar do conteúdo, em
 * vez de o bloco sumir — sumir parece "não há nada", e às vezes há (uma
 * votação aberta, uma avaliação que trava o próximo pedido de hospedagem). A
 * falha já foi para o log e o Sentry por `seguro` (lib/db/portal-inicio.ts).
 */
export function Indisponivel({
  children = "Não foi possível carregar agora. Tente de novo daqui a pouco.",
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <p className={cn("text-muted-foreground flex items-start gap-2 text-sm", className)}>
      <CloudAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
