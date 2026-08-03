import { PencilRuler } from "lucide-react"

/**
 * Estado exibido quando um artigo está listado no manifesto (a área é
 * `disponivel`) mas o arquivo .mdx ainda não foi escrito. Evita 404 em áreas
 * já mapeadas cujo conteúdo está em produção.
 */
export function EmProducao() {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <PencilRuler className="size-6" />
      <p className="text-sm font-medium">Conteúdo em produção</p>
      <p className="max-w-md text-xs">
        Este artigo já faz parte do manual, mas ainda está sendo escrito. Volte
        em breve.
      </p>
    </div>
  )
}
