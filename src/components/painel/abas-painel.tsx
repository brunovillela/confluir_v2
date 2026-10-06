"use client"

import Link from "next/link"
import { ChartColumn, Crown, Sun, UsersRound } from "lucide-react"

export type ChaveAba = "dia" | "diretor" | "coordenacao" | "indicadores"

const ICONES: Record<ChaveAba, React.ComponentType<{ className?: string }>> = {
  dia: Sun,
  diretor: Crown,
  coordenacao: UsersRound,
  indicadores: ChartColumn,
}

export const COOKIE_ABA = "painel_aba"

/**
 * Abas do painel. Cada aba é um link (?aba=…): só a aba aberta é carregada
 * no servidor. A escolha fica num cookie — o painel reabre onde a pessoa
 * parou.
 */
export function AbasPainel({
  abas,
  ativa,
}: {
  abas: { chave: ChaveAba; rotulo: string; contagem?: number }[]
  ativa: ChaveAba
}) {
  if (abas.length < 2) return null
  return (
    <nav className="hud-abas" aria-label="Seções do painel">
      {abas.map((a) => {
        const Icone = ICONES[a.chave]
        return (
          <Link
            key={a.chave}
            href={`/painel?aba=${a.chave}`}
            scroll={false}
            aria-current={a.chave === ativa ? "page" : undefined}
            className="hud-aba"
            onClick={() => {
              document.cookie = `${COOKIE_ABA}=${a.chave}; path=/; max-age=31536000; samesite=lax`
            }}
          >
            <Icone className="size-4" />
            {a.rotulo}
            {a.contagem ? (
              <span className="bg-primary text-primary-foreground hud-numero rounded-full px-1.5 text-[0.6875rem] leading-4">
                {a.contagem > 99 ? "99+" : a.contagem}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
