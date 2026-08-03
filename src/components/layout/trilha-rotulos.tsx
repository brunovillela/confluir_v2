"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

type Rotulos = Record<string, string>
type Ctx = {
  rotulos: Rotulos
  registrar: (pares: Rotulos) => void
  limpar: (chaves: string[]) => void
}

const TrilhaContext = createContext<Ctx | null>(null)

export function TrilhaProvider({ children }: { children: React.ReactNode }) {
  const [rotulos, setRotulos] = useState<Rotulos>({})
  const registrar = useCallback(
    (pares: Rotulos) => setRotulos((a) => ({ ...a, ...pares })),
    []
  )
  const limpar = useCallback(
    (chaves: string[]) =>
      setRotulos((a) => {
        const novo = { ...a }
        for (const c of chaves) delete novo[c]
        return novo
      }),
    []
  )
  const value = useMemo(
    () => ({ rotulos, registrar, limpar }),
    [rotulos, registrar, limpar]
  )
  return <TrilhaContext.Provider value={value}>{children}</TrilhaContext.Provider>
}

export function useRotulosTrilha(): Rotulos {
  return useContext(TrilhaContext)?.rotulos ?? {}
}

/**
 * Registra rótulos "amigáveis" para segmentos dinâmicos da rota, de forma que o
 * breadcrumb mostre o nome real (ex.: o nome da remessa/mandato/diretor) no
 * lugar de "Detalhe". Renderize numa página:
 *   <RotuloTrilha valores={{ [id]: "Remessa Assistencial 5/2026" }} />
 * A chave é o VALOR do segmento na URL (o UUID). Limpa ao desmontar.
 */
export function RotuloTrilha({ valores }: { valores: Rotulos }) {
  const ctx = useContext(TrilhaContext)
  const registrar = ctx?.registrar
  const limpar = ctx?.limpar
  const chave = JSON.stringify(valores)
  useEffect(() => {
    if (!registrar || !limpar) return
    registrar(valores)
    return () => limpar(Object.keys(valores))
    // valores é estável via `chave` (JSON) — evita re-registrar a cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, registrar, limpar])
  return null
}
