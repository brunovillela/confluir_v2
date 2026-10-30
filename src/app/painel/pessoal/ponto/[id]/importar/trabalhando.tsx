"use client"

import { createContext, useContext, useState } from "react"

/** A leitura pela IA está rodando? (o leitor avisa a tabela, que marca as linhas). */
export const LeituraEmAndamento = createContext<{ lendo: boolean; setLendo: (v: boolean) => void }>({
  lendo: false,
  setLendo: () => {},
})

export function ProvedorLeitura({ children }: { children: React.ReactNode }) {
  const [lendo, setLendo] = useState(false)
  return <LeituraEmAndamento.Provider value={{ lendo, setLendo }}>{children}</LeituraEmAndamento.Provider>
}

export const useLeitura = () => useContext(LeituraEmAndamento)
