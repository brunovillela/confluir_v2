import { notFound } from "next/navigation"
import { Construction } from "lucide-react"

import { ICONES_MODULOS } from "@/components/layout/icones-modulos"
import { Badge } from "@/components/ui/badge"
import { requirePermissao } from "@/lib/auth"
import { moduloDaRota } from "@/lib/permissoes"

/**
 * Rota provisória dos módulos — será substituída por rotas dedicadas
 * conforme cada módulo for implementado (Fase 3B em diante).
 */
export default async function ModuloPage({
  params,
}: {
  params: Promise<{ modulo: string[] }>
}) {
  const { modulo: segmentos } = await params
  const pathname = `/painel/${segmentos.join("/")}`

  const modulo = moduloDaRota(pathname)
  if (!modulo || modulo.href === "/painel") notFound()

  await requirePermissao(modulo.chave, modulo.chavesAlternativas)

  const Icone = ICONES_MODULOS[modulo.icone]

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {Icone && <Icone className="text-muted-foreground size-5" />}
            <h1 className="text-2xl font-semibold tracking-tight">
              {modulo.titulo}
            </h1>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {modulo.descricao}
          </p>
        </div>
        <Badge variant="secondary">Em desenvolvimento</Badge>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-24 text-center">
        <Construction className="text-muted-foreground size-8" />
        <p className="text-muted-foreground max-w-sm text-sm text-balance">
          Este módulo será implementado nas próximas fases do projeto. A
          estrutura de acesso e permissões já está ativa.
        </p>
      </div>
    </>
  )
}
