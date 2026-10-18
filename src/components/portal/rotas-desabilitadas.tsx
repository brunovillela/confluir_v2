"use client"

import { createContext, useContext } from "react"

const Contexto = createContext<readonly string[]>([])

/**
 * Rotas do menu das partes desabilitadas em Filiados › Área do associado,
 * para o que a casca desenha no cliente sem receber `ocultos` por prop (a
 * tela de erro, que oferece "Falar com o sindicato"). Montado pelo layout do
 * portal; como ele, não re-renderiza ao navegar — serve para escolher links,
 * nunca para guardar uma rota (quem guarda é o GuardaParte de cada seção).
 */
export function RotasDesabilitadasProvider({
  rotas,
  children,
}: {
  rotas: readonly string[]
  children: React.ReactNode
}) {
  return <Contexto.Provider value={rotas}>{children}</Contexto.Provider>
}

/** A rota do menu é de uma parte desabilitada. Fora da casca, nunca. */
export function useRotaDesabilitada(href: string): boolean {
  return useContext(Contexto).includes(href)
}
