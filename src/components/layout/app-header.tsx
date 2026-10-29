"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { ThemeToggle } from "@/components/theme-toggle"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { MODULOS } from "@/lib/permissoes"

import { useRotulosTrilha, useTrilhaPropria } from "./trilha-rotulos"

type Trilha = { titulo: string; href: string; segmento: string }

/** Segmentos de rota que não viram rótulo só com a maiúscula (sigla ou acento). */
const ROTULOS_SEGMENTO: Record<string, string> = {
  rpa: "RPA",
  configuracao: "Configuração",
  configuracoes: "Configurações",
  solicitacoes: "Solicitações",
  comparacoes: "Comparações",
  cartoes: "Cartões",
  "centros-custo": "Centros de custo",
  "saude-cadastros": "Saúde dos cadastros",
  grupos: "Grupos empresariais",
  funcionarios: "Funcionários",
  funcionario: "Funcionário",
  diarias: "Diárias",
  ferias: "Férias",
  ausencias: "Ausências",
  aso: "ASO",
  asos: "ASOs",
  anuenios: "Anuênios",
  historico: "Histórico",
  atribuicoes: "Atribuições",
  perfil: "Meu perfil",
  "dados-bancarios": "Dados bancários",
  "contas-bancarias": "Contas bancárias",
  alteracoes: "Alterações",
}

/** Monta a trilha de breadcrumbs a partir da rota, usando os títulos dos módulos. */
function montarTrilha(pathname: string): Trilha[] {
  const segmentos = pathname.split("/").filter(Boolean)
  const trilha: Trilha[] = []
  let href = ""

  const pareceUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  for (const segmento of segmentos) {
    href += `/${segmento}`
    const modulo = MODULOS.find((m) => m.href === href)
    const titulo =
      modulo?.titulo ??
      ROTULOS_SEGMENTO[segmento] ??
      (pareceUuid.test(segmento)
        ? "Detalhe"
        : decodeURIComponent(segmento)
            .replace(/-/g, " ")
            .replace(/^\w/, (c) => c.toUpperCase()))
    trilha.push({ titulo, href, segmento })
  }

  return trilha
}

export function AppHeader({ acoes }: { acoes?: React.ReactNode }) {
  const pathname = usePathname()
  const rotulos = useRotulosTrilha()
  const propria = useTrilhaPropria()
  // A página pode declarar a própria trilha quando a rota não descreve a
  // hierarquia (ver TrilhaPropria).
  const trilha: Trilha[] =
    propria?.map((d) => ({ ...d, segmento: d.href })) ?? montarTrilha(pathname)

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-(--z-sticky) flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur print:hidden">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4!" />

      {/* Trilha numa linha só, sempre: os primeiros níveis somem conforme falta
          espaço (2 no celular, 4 em telas médias, todos nas largas) e cada nome
          longo é cortado — com os nomes reais (desde 17/10/2026) ela quebrava
          em várias linhas e invadia a página. */}
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap overflow-hidden">
          {trilha.map((item, i) => {
            const ultimo = i === trilha.length - 1
            const titulo = rotulos[item.segmento] ?? item.titulo
            // Distância até o fim: 0 = página atual.
            const d = trilha.length - 1 - i
            const item_ = d <= 1 ? "min-w-0" : d <= 3 ? "hidden min-w-0 lg:inline-flex" : "hidden min-w-0 2xl:inline-flex"
            // O separador antes do primeiro nível visível também some.
            const sep = d <= 0 ? undefined : d <= 2 ? "hidden lg:block" : "hidden 2xl:block"
            return (
              <Fragment key={item.href}>
                {i > 0 && <BreadcrumbSeparator className={sep} />}
                <BreadcrumbItem className={item_}>
                  {ultimo ? (
                    <BreadcrumbPage className="max-w-56 truncate">{titulo}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={item.href} className="max-w-48 truncate">
                        {titulo}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1">
        {acoes}
        <ThemeToggle />
      </div>
    </header>
  )
}
