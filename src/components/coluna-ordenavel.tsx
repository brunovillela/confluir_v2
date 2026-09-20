import Link from "next/link"
import { ArrowDown, ArrowUp } from "lucide-react"

import { TableHead } from "@/components/ui/table"

/**
 * Cabeçalho de tabela que ordena por clique, no padrão das listas do painel:
 * o link troca `ordem` e inverte `dir` quando a coluna já é a ativa.
 */
export function ColunaOrdenavel({
  chave,
  rotulo,
  ordem,
  dir,
  href,
  className,
}: {
  chave: string
  rotulo: string
  /** Coluna ordenada agora. */
  ordem: string
  dir: "asc" | "desc"
  href: (chave: string) => string
  className?: string
}) {
  const ativa = ordem === chave
  return (
    <TableHead className={className}>
      <Link
        href={href(chave)}
        className="hover:text-foreground inline-flex items-center gap-1 whitespace-nowrap"
        aria-sort={ativa ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {rotulo}
        {ativa &&
          (dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
      </Link>
    </TableHead>
  )
}

/** Monta o link de ordenação preservando os filtros já na URL. */
export function linkDeOrdem(
  base: string,
  params: Record<string, string | undefined>,
  ordemAtual: string,
  dirAtual: "asc" | "desc",
  /** Parâmetros que não devem sobreviver à troca de ordem (ex.: página). */
  efemeros: string[] = []
) {
  return (chave: string) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v && !efemeros.includes(k)) qs.set(k, v)
    }
    qs.set("ordem", chave)
    qs.set("dir", ordemAtual === chave && dirAtual === "asc" ? "desc" : "asc")
    return `${base}?${qs}`
  }
}
