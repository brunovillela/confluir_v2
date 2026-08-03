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

import { useRotulosTrilha } from "./trilha-rotulos"

type Trilha = { titulo: string; href: string; segmento: string }

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
  const trilha = montarTrilha(pathname)
  const rotulos = useRotulosTrilha()

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-(--z-sticky) flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4!" />

      <Breadcrumb>
        <BreadcrumbList>
          {trilha.map((item, i) => {
            const ultimo = i === trilha.length - 1
            const titulo = rotulos[item.segmento] ?? item.titulo
            return (
              <Fragment key={item.href}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {ultimo ? (
                    <BreadcrumbPage>{titulo}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{titulo}</Link>
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
