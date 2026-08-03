import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

/**
 * Bloco de links cruzados no fim de um artigo. Uso em MDX:
 *
 * <VejaTambem links={[
 *   { titulo: "Contracheques", href: "/painel/ajuda/pessoal/contracheques" },
 *   { titulo: "Férias", href: "/painel/ajuda/pessoal/ferias" },
 * ]} />
 */
export function VejaTambem({
  links,
}: {
  links: { titulo: string; href: string; descricao?: string }[]
}) {
  if (!links.length) return null
  return (
    <section className="mt-8 border-t pt-5">
      <h2 className="mb-3 text-sm font-medium">Veja também</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="group hover:border-primary/40 flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors"
            >
              <ArrowUpRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{l.titulo}</span>
                {l.descricao && (
                  <span className="text-muted-foreground block text-xs">
                    {l.descricao}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
