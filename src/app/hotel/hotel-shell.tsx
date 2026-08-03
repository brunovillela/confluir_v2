import Link from "next/link"
import { ArrowLeftRight } from "lucide-react"

import { Marca } from "@/components/marca"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { areasDaConta } from "@/lib/auth"

import { sairDoHotel } from "./actions"

const NAV = [
  { titulo: "Início", href: "/hotel/inicio" },
  { titulo: "Faturamento", href: "/hotel/faturamento" },
  { titulo: "Dados bancários", href: "/hotel/contas" },
  { titulo: "Acordo e orientações", href: "/hotel/acordo" },
]

/** Casca da área logada do hotel parceiro (header + navegação + container). */
export async function HotelShell({
  nomeHotel,
  children,
}: {
  nomeHotel: string
  children: React.ReactNode
}) {
  // Alternador de interface para contas com mais de um perfil.
  const outrasAreas = (await areasDaConta()).filter(
    (a) => a.href !== "/hotel/inicio"
  )
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background sticky top-0 z-10 border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Marca variante="completa" />
            <Badge variant="outline" className="hidden max-w-56 truncate sm:inline-flex">
              {nomeHotel}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {outrasAreas.map((area) => (
              <Button key={area.href} variant="ghost" size="sm" asChild>
                <Link href={area.href}>
                  <ArrowLeftRight />
                  <span className="hidden md:inline">{area.titulo}</span>
                </Link>
              </Button>
            ))}
            <ThemeToggle />
            <form action={sairDoHotel}>
              <Button variant="outline" size="sm" type="submit">
                Sair
              </Button>
            </form>
          </div>
        </div>
        <nav className="mx-auto w-full max-w-5xl overflow-x-auto px-4">
          <div className="flex gap-1 pb-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors"
              >
                {item.titulo}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  )
}
