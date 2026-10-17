import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Peças de navegação das Votações (reorganização de 17/10/2026): abas no
 * endereço (`?aba=`), o "voltar" ao nível pai e as setas entre irmãos.
 */

export type Aba = { chave: string; rotulo: string; href: string; contagem?: number | null; alerta?: boolean }

/** Abas como links: o endereço guarda a aba, e o voltar do navegador volta para ela. */
export function AbasVotacao({ abas, ativa }: { abas: Aba[]; ativa: string }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b px-1" aria-label="Seções">
      {abas.map((a) => {
        const atual = a.chave === ativa
        return (
          <Link
            key={a.chave}
            href={a.href}
            scroll={false}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              atual
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {a.rotulo}
            {a.contagem !== undefined && a.contagem !== null && (
              <Badge
                variant={a.alerta ? "warning" : "outline"}
                className="h-5 px-1.5 text-[11px] tabular-nums"
              >
                {a.contagem.toLocaleString("pt-BR")}
              </Badge>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

/** "← <pai>": volta ao nível de cima com o contexto da fonte. */
export function VoltarNivel({ href, rotulo }: { href: string; rotulo: string }) {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 max-w-full justify-self-start">
      <Link href={href}>
        <ArrowLeft />
        <span className="truncate">{rotulo}</span>
      </Link>
    </Button>
  )
}

/** Setas para o irmão anterior e o próximo (rodadas da campanha). */
export function SetasIrmaos({
  anterior,
  proximo,
}: {
  anterior: { href: string; rotulo: string } | null
  proximo: { href: string; rotulo: string } | null
}) {
  if (!anterior && !proximo) return null
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" asChild={Boolean(anterior)} disabled={!anterior} title={anterior?.rotulo}>
        {anterior ? (
          <Link href={anterior.href}>
            <ChevronLeft />
            <span className="hidden sm:inline">Anterior</span>
          </Link>
        ) : (
          <span>
            <ChevronLeft />
            <span className="hidden sm:inline">Anterior</span>
          </span>
        )}
      </Button>
      <Button variant="outline" size="sm" asChild={Boolean(proximo)} disabled={!proximo} title={proximo?.rotulo}>
        {proximo ? (
          <Link href={proximo.href}>
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight />
          </Link>
        ) : (
          <span>
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight />
          </span>
        )}
      </Button>
    </div>
  )
}

/** Chips dos irmãos (assembleias da mesma rodada): troca sem voltar. */
export function ChipsIrmaos({ itens, atual }: { itens: { id: string; rotulo: string; href: string }[]; atual: string }) {
  if (itens.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">Assembleias da rodada:</span>
      {itens.map((i) => (
        <Button key={i.id} variant={i.id === atual ? "default" : "outline"} size="sm" className="h-7" asChild>
          <Link href={i.href} aria-current={i.id === atual ? "page" : undefined}>
            {i.rotulo}
          </Link>
        </Button>
      ))}
    </div>
  )
}
