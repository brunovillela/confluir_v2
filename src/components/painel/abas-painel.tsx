"use client"

import Link from "next/link"
import { ChartColumn, Sun, UsersRound } from "lucide-react"

import { usePendencias } from "@/components/layout/contadores-header"

export type ChaveAba = "dia" | "coordenacao" | "gestao"

const ICONES: Record<ChaveAba, React.ComponentType<{ className?: string }>> = {
  dia: Sun,
  coordenacao: UsersRound,
  gestao: ChartColumn,
}

export const COOKIE_ABA = "painel_aba"

/**
 * Abas do painel. Cada aba é um link (?aba=…): só a aba aberta é carregada
 * no servidor. A escolha fica num cookie — o painel reabre onde a pessoa
 * parou. O selo soma as filas da caixa de entrada listadas em `pendencias`
 * da aba, lidas do ContadoresProvider (atualiza junto com a caixa, que
 * publica nele a lista que a página trouxer).
 */
export function AbasPainel({
  abas,
  ativa,
}: {
  abas: { chave: ChaveAba; rotulo: string; pendencias?: string[] }[]
  ativa: ChaveAba
}) {
  const lista = usePendencias() ?? []
  if (abas.length < 2) return null
  return (
    <nav className="hud-abas" aria-label="Seções do painel">
      {abas.map((a) => {
        const Icone = ICONES[a.chave]
        const contagem = a.pendencias
          ? lista.filter((p) => a.pendencias?.includes(p.chave)).reduce((s, p) => s + p.quantidade, 0)
          : 0
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
            {contagem ? (
              <span className="bg-primary text-primary-foreground hud-numero rounded-full px-1.5 text-[0.6875rem] leading-4">
                {contagem > 99 ? "99+" : contagem}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
