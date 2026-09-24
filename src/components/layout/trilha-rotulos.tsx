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
/** Um degrau da trilha declarado pela página (ver `TrilhaPropria`). */
export type DegrauTrilha = { titulo: string; href: string }
type Ctx = {
  rotulos: Rotulos
  registrar: (pares: Rotulos) => void
  limpar: (chaves: string[]) => void
  propria: DegrauTrilha[] | null
  definirPropria: (degraus: DegrauTrilha[] | null) => void
}

const TrilhaContext = createContext<Ctx | null>(null)

export function TrilhaProvider({ children }: { children: React.ReactNode }) {
  const [rotulos, setRotulos] = useState<Rotulos>({})
  const [propria, setPropria] = useState<DegrauTrilha[] | null>(null)
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
  const definirPropria = useCallback(
    (degraus: DegrauTrilha[] | null) => setPropria(degraus),
    []
  )
  const value = useMemo(
    () => ({ rotulos, registrar, limpar, propria, definirPropria }),
    [rotulos, registrar, limpar, propria, definirPropria]
  )
  return <TrilhaContext.Provider value={value}>{children}</TrilhaContext.Provider>
}

export function useRotulosTrilha(): Rotulos {
  return useContext(TrilhaContext)?.rotulos ?? {}
}

/** A trilha declarada pela página, quando houver. */
export function useTrilhaPropria(): DegrauTrilha[] | null {
  return useContext(TrilhaContext)?.propria ?? null
}

/**
 * Registra rótulos "amigáveis" para segmentos dinâmicos da rota, de forma que o
 * breadcrumb mostre o nome real (ex.: o nome da remessa/mandato/diretor) no
 * lugar de "Detalhe". Renderize numa página:
 *   <RotuloTrilha valores={{ [id]: "Remessa Assistencial 5/2026" }} />
 * A chave é o VALOR do segmento na URL (o UUID). Limpa ao desmontar.
 */
/**
 * Declara a trilha INTEIRA da página, no lugar da derivada da URL.
 *
 * Existe porque a rota nem sempre descreve a hierarquia: a rodada mora em
 * `/votacoes/rodadas/<id>`, mas pertence a uma campanha, e o breadcrumb tem de
 * levar de volta àquela campanha — não a um `/rodadas` que não existe. O
 * último degrau vira a página atual (sem link).
 */
export function TrilhaPropria({ degraus }: { degraus: DegrauTrilha[] }) {
  const definir = useContext(TrilhaContext)?.definirPropria
  const chave = JSON.stringify(degraus)
  useEffect(() => {
    if (!definir) return
    definir(degraus)
    return () => definir(null)
    // degraus é estável via `chave` (JSON)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, definir])
  return null
}

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
