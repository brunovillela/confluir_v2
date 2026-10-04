"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeftRight,
  BedDouble,
  Bell,
  CalendarDays,
  CircleHelp,
  HandCoins,
  Handshake,
  HeartPulse,
  Home,
  IdCard,
  Menu,
  MessagesSquare,
  Newspaper,
  ScrollText,
  ShieldCheck,
  UserPen,
  Vote,
  type LucideIcon,
} from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export type ItemNavPortal = { titulo: string; href: string }

const ICONES: Record<string, LucideIcon> = {
  "/portal/inicio": Home,
  "/portal/cadastro": UserPen,
  "/portal/carteirinha": IdCard,
  "/portal/contribuicao": HandCoins,
  "/portal/hospedagem": BedDouble,
  "/portal/convenios": Handshake,
  "/portal/saude": HeartPulse,
  "/portal/noticias": Newspaper,
  "/portal/eventos": CalendarDays,
  "/portal/votacao": Vote,
  "/portal/oposicao": ScrollText,
  "/portal/lgpd": ShieldCheck,
  "/portal/ajuda": CircleHelp,
  "/portal/avisos": Bell,
  "/portal/atendimento": MessagesSquare,
}

/** Os quatro atalhos fixos da barra inferior; o resto fica em "Mais". */
const FIXOS_INFERIOR = ["/portal/inicio", "/portal/carteirinha", "/portal/hospedagem", "/portal/avisos"]

function ativo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Navegação horizontal do topo (telas médias para cima), com a página atual marcada. */
export function PortalNav({ itens }: { itens: ItemNavPortal[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Seções do portal" className="mx-auto hidden w-full max-w-5xl overflow-x-auto px-4 md:block">
      <div className="flex gap-1 pb-2">
        {itens.map((item) => {
          const atual = ativo(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={atual ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                atual
                  ? "bg-primary/10 text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              {item.titulo}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * Barra inferior do celular (onda 4, F5): quatro atalhos + "Mais" com a
 * lista completa. Alvos de 56px, página atual em destaque, respeita a área
 * segura do aparelho.
 */
export function PortalNavInferior({
  itens,
  naoLidos,
  outrasAreas = [],
}: {
  itens: ItemNavPortal[]
  naoLidos: number
  /** Outras interfaces da mesma conta (painel, recepção, hotel). */
  outrasAreas?: ItemNavPortal[]
}) {
  const pathname = usePathname()
  const [aberto, setAberto] = useState(false)
  const fixos = FIXOS_INFERIOR.map((href) => itens.find((i) => i.href === href)).filter(
    (i): i is ItemNavPortal => Boolean(i)
  )
  const restantes = itens.filter((i) => !FIXOS_INFERIOR.includes(i.href))
  const maisAtivo = restantes.some((i) => ativo(pathname, i.href))

  return (
    <nav
      aria-label="Navegação do portal"
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {fixos.map((item) => {
          const Icone = ICONES[item.href] ?? Home
          const atual = ativo(pathname, item.href)
          const titulo = item.href === "/portal/inicio" ? "Início" : item.titulo
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={atual ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight",
                  atual ? "text-primary font-medium" : "text-muted-foreground"
                )}
              >
                <Icone className="size-5" aria-hidden />
                <span className="truncate">{titulo}</span>
                {item.href === "/portal/avisos" && naoLidos > 0 && (
                  <span className="bg-primary text-primary-foreground absolute top-1.5 left-1/2 ml-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
                    {naoLidos > 99 ? "99+" : naoLidos}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
        <li>
          <Sheet open={aberto} onOpenChange={setAberto}>
            <SheetTrigger
              className={cn(
                "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight",
                maisAtivo ? "text-primary font-medium" : "text-muted-foreground"
              )}
              aria-label="Mais seções"
            >
              <Menu className="size-5" aria-hidden />
              <span>Mais</span>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto rounded-t-2xl">
              <SheetHeader className="text-left">
                <SheetTitle>Todas as seções</SheetTitle>
                <SheetDescription>Tudo que o portal oferece a você.</SheetDescription>
              </SheetHeader>
              <ul className="grid grid-cols-2 gap-2 px-4 pb-6">
                {itens.map((item) => {
                  const Icone = ICONES[item.href] ?? Home
                  const atual = ativo(pathname, item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setAberto(false)}
                        aria-current={atual ? "page" : undefined}
                        className={cn(
                          "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                          atual ? "border-primary/40 bg-primary/10 font-medium" : "hover:bg-muted/60"
                        )}
                      >
                        <Icone className="text-muted-foreground size-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.titulo}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              {outrasAreas.length > 0 && (
                <div className="px-4 pb-6">
                  <p className="text-muted-foreground mb-2 text-xs font-medium">Outras áreas desta conta</p>
                  <ul className="grid gap-2">
                    {outrasAreas.map((a) => (
                      <li key={a.href}>
                        <Link
                          href={a.href}
                          onClick={() => setAberto(false)}
                          className="hover:bg-muted/60 flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                        >
                          <ArrowLeftRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                          <span className="truncate">{a.titulo}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  )
}
