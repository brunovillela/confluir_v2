import Link from "next/link"
import { ArrowLeftRight } from "lucide-react"

import { Marca } from "@/components/marca"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { sairDoPortal } from "@/lib/actions/sessao"
import { areasDaConta } from "@/lib/auth"

const NAV = [
  { titulo: "Início", href: "/portal/inicio" },
  { titulo: "Meu cadastro", href: "/portal/cadastro" },
  { titulo: "Hospedagem", href: "/portal/hospedagem" },
  { titulo: "Saúde", href: "/portal/saude" },
  { titulo: "Notícias", href: "/portal/noticias" },
  { titulo: "Agenda", href: "/portal/agenda" },
  { titulo: "Oposição à contribuição", href: "/portal/oposicao" },
  { titulo: "LGPD", href: "/portal/lgpd" },
  { titulo: "Ajuda", href: "/portal/ajuda" },
]

/** Casca da área logada do portal do associado (header + navegação). */
export async function PortalShell({ children }: { children: React.ReactNode }) {
  const outrasAreas = (await areasDaConta()).filter(
    (a) => a.href !== "/portal/inicio"
  )

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background sticky top-0 z-10 border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <Marca variante="completa" />
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
            <form action={sairDoPortal}>
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
