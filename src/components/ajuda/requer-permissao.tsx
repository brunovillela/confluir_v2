import { Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"

/**
 * Selo que indica qual permissão a ação exige. O texto é o rótulo humano da
 * permissão (não a chave técnica), ex.:
 *
 * <RequerPermissao>Gestão de Pessoal</RequerPermissao>
 * <RequerPermissao>Diárias</RequerPermissao>
 */
export function RequerPermissao({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="my-1 gap-1 align-middle">
      <Lock className="size-3" />
      Requer: {children}
    </Badge>
  )
}
