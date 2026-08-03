import { Info, Lightbulb, OctagonAlert, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * Caixa de destaque para artigos do manual. Três intensidades:
 * - `dica`     → informação útil, opcional (info)
 * - `atencao`  → regra ou trava que o usuário precisa conhecer (warning)
 * - `perigo`   → ação irreversível ou com impacto sério (destructive)
 */
type TipoAviso = "dica" | "atencao" | "perigo" | "nota"

const CONFIG = {
  nota: { variant: "info", icone: Info, rotulo: "Nota" },
  dica: { variant: "success", icone: Lightbulb, rotulo: "Dica" },
  atencao: { variant: "warning", icone: TriangleAlert, rotulo: "Atenção" },
  perigo: { variant: "destructive", icone: OctagonAlert, rotulo: "Cuidado" },
} as const

export function Aviso({
  tipo = "nota",
  titulo,
  children,
}: {
  tipo?: TipoAviso
  titulo?: string
  children: React.ReactNode
}) {
  const { variant, icone: Icone, rotulo } = CONFIG[tipo]
  return (
    <Alert variant={variant} className="my-4">
      <Icone />
      <AlertTitle>{titulo ?? rotulo}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
