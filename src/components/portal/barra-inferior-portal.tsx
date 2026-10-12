"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeftRight, Menu, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

import { useNaoLidos } from "./contador-avisos"
import { agruparNav, ativo, FIXOS_INFERIOR, NAV_PORTAL, seloNaoLidos, type ItemNavPortal } from "./navegacao-portal"

type Area = { titulo: string; href: string }

/**
 * Item da barra (alvo de 56 px). tracking-tight + px-0.5: "Contribuição" e
 * "Atendimento" cabem inteiros a partir de 360 px — com px-1 já viravam
 * "Contribuiç…" em 375 px.
 *
 * Tamanho do rótulo (A178): 12 px (text-xs, o piso da escala) de 412 px em
 * diante, onde cada item tem ~78 px úteis; abaixo disso, 11 px. Medido na
 * Poppins: "Atendimento" ocupa ~76 px em 12 px (peso 500, do item ativo) —
 * nos celulares de 360 a 393 px ele viraria "Atendime…".
 */
const ITEM_BARRA =
  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] leading-tight tracking-tight min-[412px]:text-xs"

/**
 * Barra inferior do portal, a navegação de celular E tablet (até lg; de lg em
 * diante entra a lateral). Quatro atalhos — Início, Contribuição, Carteirinha,
 * Atendimento (A57) — e "Mais", uma folha com o resto do menu nos MESMOS
 * grupos da lateral (A118). Alvos de 56 px; respeita a área segura do aparelho.
 */
export function BarraInferiorPortal({
  ocultos,
  outrasAreas,
  className,
}: {
  ocultos: string[]
  outrasAreas: Area[]
  className?: string
}) {
  const pathname = usePathname()
  const [aberto, setAberto] = useState(false)

  const fixos = FIXOS_INFERIOR.map((href) => NAV_PORTAL.find((i) => i.href === href)).filter(
    (i): i is ItemNavPortal => Boolean(i)
  )
  // "Mais" acende em qualquer página que não seja um dos quatro atalhos.
  const maisAtivo = !fixos.some((i) => ativo(pathname, i.href))

  return (
    <nav
      aria-label="Navegação do portal"
      className={cn(
        "bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-(--z-dropdown) border-t backdrop-blur print:hidden",
        className
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {fixos.map((item) => {
          const atual = ativo(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={atual ? "page" : undefined}
                className={cn(ITEM_BARRA, atual ? "text-primary font-medium" : "text-muted-foreground")}
              >
                <item.icone className="size-5" aria-hidden />
                <span className="max-w-full truncate">{item.titulo}</span>
              </Link>
            </li>
          )
        })}
        <li>
          <Sheet open={aberto} onOpenChange={setAberto}>
            <SheetTrigger
              className={cn(ITEM_BARRA, "w-full", maisAtivo ? "text-primary font-medium" : "text-muted-foreground")}
              aria-label="Mais seções"
            >
              <Menu className="size-5" aria-hidden />
              <span>Mais</span>
            </SheetTrigger>
            {/* Fechar próprio: o do Sheet tem 28 px e rótulo em inglês ("Close"). */}
            <SheetContent
              side="bottom"
              showCloseButton={false}
              className="max-h-[85svh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            >
              <SheetClose asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar" className="absolute top-2 right-2 size-11">
                  <X />
                </Button>
              </SheetClose>
              <FolhaMais ocultos={ocultos} outrasAreas={outrasAreas} aoEscolher={() => setAberto(false)} />
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  )
}

/**
 * Conteúdo da folha "Mais": o menu sem os quatro atalhos da barra, em grupos
 * com rótulo, rótulos inteiros (quebram em duas linhas em vez de cortar) e as
 * outras áreas da conta no fim. No tablet a folha ocupa a largura toda, então
 * o conteúdo fica numa coluna central.
 */
function FolhaMais({
  ocultos,
  outrasAreas,
  aoEscolher,
}: {
  ocultos: string[]
  outrasAreas: Area[]
  aoEscolher: () => void
}) {
  const pathname = usePathname()
  const naoLidos = useNaoLidos()
  const grupos = agruparNav(NAV_PORTAL.filter((i) => !ocultos.includes(i.href) && !FIXOS_INFERIOR.includes(i.href)))

  return (
    <div className="mx-auto w-full max-w-2xl">
      <SheetHeader className="pr-14 text-left">
        <SheetTitle>Mais seções</SheetTitle>
        <SheetDescription>Tudo o que o portal oferece, além dos atalhos da barra.</SheetDescription>
      </SheetHeader>
      <div className="grid gap-4 px-4 pb-6">
        {grupos.map(({ grupo, itens }) => (
          <section key={grupo ?? "topo"}>
            {grupo && <h3 className="text-muted-foreground mb-2 px-1 text-xs font-medium">{grupo}</h3>}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {itens.map((item) => {
                const atual = ativo(pathname, item.href)
                const comSelo = item.href === "/portal/avisos" && naoLidos > 0
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={aoEscolher}
                      aria-current={atual ? "page" : undefined}
                      aria-label={comSelo ? `${item.titulo}: ${naoLidos} não lidos` : undefined}
                      className={cn(
                        "flex h-full min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                        atual ? "border-primary/40 bg-primary/10 font-medium" : "hover:bg-muted/60"
                      )}
                    >
                      <item.icone className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <span className="line-clamp-2 min-w-0 flex-1 leading-tight">{item.titulo}</span>
                      {comSelo && (
                        <span className="bg-primary text-primary-foreground flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums">
                          {seloNaoLidos(naoLidos)}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {outrasAreas.length > 0 && (
          <section>
            <h3 className="text-muted-foreground mb-2 px-1 text-xs font-medium">Outras áreas desta conta</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {outrasAreas.map((a) => (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    onClick={aoEscolher}
                    className="hover:bg-muted/60 flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <ArrowLeftRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <span className="line-clamp-2 leading-tight">{a.titulo}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
