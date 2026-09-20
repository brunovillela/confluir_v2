import Link from "next/link"
import { Building, HandCoins, Users } from "lucide-react"

/**
 * As sub-áreas da Diretoria: mandatos (e seus integrantes), instâncias e as
 * diárias — esta última só aparece para quem tem a permissão própria dela.
 */
export function AbasDiretoria({
  atual,
  comDiarias = false,
}: {
  atual: "mandatos" | "instancias" | "diarias"
  comDiarias?: boolean
}) {
  const abas = [
    { chave: "mandatos", rotulo: "Mandatos", href: "/painel/institucional/diretoria", icone: Users },
    { chave: "instancias", rotulo: "Instâncias", href: "/painel/institucional/diretoria/instancias", icone: Building },
    ...(comDiarias
      ? [
          {
            chave: "diarias" as const,
            rotulo: "Diárias",
            href: "/painel/institucional/diretoria/diarias",
            icone: HandCoins,
          },
        ]
      : []),
  ] as const
  return (
    <nav aria-label="Áreas da Diretoria" className="bg-muted inline-flex w-fit rounded-md p-1">
      {abas.map(({ chave, rotulo, href, icone: Icone }) => (
        <Link
          key={chave}
          href={href}
          aria-current={atual === chave ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            atual === chave ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icone className="size-4" />
          {rotulo}
        </Link>
      ))}
    </nav>
  )
}
