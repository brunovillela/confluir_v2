import Link from "next/link"
import { ArrowLeftRight, Eye } from "lucide-react"

import { Marca } from "@/components/marca"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { areasDaConta } from "@/lib/auth"
import { permissoesDaVisualizacao } from "@/lib/hotel-acesso"
import { AREAS_HOTEL, podeVerArea, type ChaveAreaHotel } from "@/lib/hotel-permissoes"
import { getVisualizacaoHotel } from "@/lib/visualizacao-hotel"

import { encerrarVisualizacaoHotel } from "@/lib/actions/visualizacao-hotel"

import { sairDoHotel } from "./actions"

/**
 * As abas dependem do convênio do hotel:
 *  - demanda garantida: o Confluir distribui os quartos e o hóspede chega com
 *    a vaga confirmada, então o que existe é o mapa da noite e a recepção;
 *  - pagamento por uso: o cupom espera o hotel confirmar, então existem as
 *    filas de cupons e de reservas.
 *
 * Além do convênio, as PERMISSÕES do usuário (lib/hotel-permissoes.ts) tiram
 * do menu as áreas sem acesso. Início e Ajuda ficam sempre.
 */
const NAV: { titulo: string; href: string; em: "ambos" | "uso" | "garantida"; area?: ChaveAreaHotel }[] = [
  { titulo: "Início", href: "/hotel/inicio", em: "ambos" },
  ...AREAS_HOTEL.map((a) => ({ titulo: a.titulo, href: a.href, em: a.em, area: a.chave })),
  { titulo: "Ajuda", href: "/hotel/ajuda", em: "ambos" },
]

/** Casca da área logada do hotel parceiro (header + navegação + container). */
export async function HotelShell({
  nomeHotel,
  garantida = false,
  preview,
  somenteConsulta = false,
  children,
}: {
  nomeHotel: string
  /** Convênio de demanda garantida — decide quais abas aparecem. */
  garantida?: boolean
  /** Gestão olhando a área do hotel (somente leitura) — ver a tarja. */
  preview?: { gestorNome?: string | null }
  /** Área com edição em que o usuário só consulta — mostra o aviso. */
  somenteConsulta?: boolean
  children: React.ReactNode
}) {
  const visualizacao = await getVisualizacaoHotel()
  const permissoes = visualizacao ? permissoesDaVisualizacao(visualizacao) : null
  const nav = NAV.filter(
    (i) =>
      (i.em === "ambos" || i.em === (garantida ? "garantida" : "uso")) &&
      (!i.area || podeVerArea(permissoes, i.area))
  )
  // Alternador de interface para contas com mais de um perfil. Na
  // visualização não aparece: é da gestão, não do hotel.
  const outrasAreas = preview
    ? []
    : (await areasDaConta()).filter((a) => a.href !== "/hotel/inicio")
  return (
    <div className="flex min-h-svh flex-col">
      {preview && (
        <div className="border-warning/40 bg-warning/10 text-warning-fg border-b">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Eye className="size-4 shrink-0" />
              <span>
                Visualizando a área de <strong>{nomeHotel}</strong> — somente leitura
                {preview.gestorNome ? ` · ${preview.gestorNome}` : ""}
              </span>
            </span>
            <form action={encerrarVisualizacaoHotel}>
              <Button variant="outline" size="sm" type="submit">
                Sair da visualização
              </Button>
            </form>
          </div>
        </div>
      )}

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
            {!preview && (
              <form action={sairDoHotel}>
                <Button variant="outline" size="sm" type="submit">
                  Sair
                </Button>
              </form>
            )}
          </div>
        </div>
        <nav className="mx-auto w-full max-w-5xl overflow-x-auto px-4">
          <div className="flex gap-1 pb-2">
            {nav.map((item) => (
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
        {somenteConsulta && (
          <div className="border-info/40 bg-info/10 text-info-fg rounded-md border px-3 py-2 text-sm">
            Seu acesso a esta área é de <strong>consulta</strong>: dá para ver, mas não registrar
            nada. Para mudar, fale com o sindicato.
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
