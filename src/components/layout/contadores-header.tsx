"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

import { PendenciasIndicador } from "@/components/layout/pendencias-indicador"
import { SinoNotificacoes } from "@/components/layout/sino-notificacoes"
import type { Pendencia } from "@/lib/db/pendencias"
import type { PendenciasCarimbadas } from "@/lib/db/pendencias-carimbadas"

/** Intervalo da atualização em segundo plano, com a aba visível. */
const INTERVALO_MS = 60_000

type Contadores = {
  pendencias: PendenciasCarimbadas
  naoLidas: number
  publicar: (p: PendenciasCarimbadas) => void
}

const Contexto = createContext<Contadores | null>(null)

/**
 * FONTE ÚNICA da caixa de entrada e do sino no painel (09/10/2026). Antes, o
 * contador do cabeçalho se atualizava sozinho (a cada minuto e ao voltar o
 * foco) e a caixa da home só ao navegar — os dois divergiam. Agora este
 * provedor faz a consulta a /api/painel/contadores, que devolve a LISTA, e o
 * cabeçalho, a caixa e os selos das abas leem daqui. O servidor renderiza os
 * valores iniciais; falha de rede mantém o último valor.
 */
export function ContadoresProvider({
  pendencias,
  naoLidas,
  children,
}: {
  pendencias: PendenciasCarimbadas
  naoLidas: number
  children: React.ReactNode
}) {
  const [estado, setEstado] = useState({ pendencias, naoLidas })
  // O layout re-renderizado (router.refresh, server action) traz valores
  // novos: eles vencem se forem mais recentes (ajuste durante a renderização).
  const [doServidor, setDoServidor] = useState({ pendencias, naoLidas })
  if (doServidor.pendencias.em !== pendencias.em || doServidor.naoLidas !== naoLidas) {
    setDoServidor({ pendencias, naoLidas })
    setEstado((e) => ({
      naoLidas,
      pendencias: pendencias.em > e.pendencias.em ? pendencias : e.pendencias,
    }))
  }

  useEffect(() => {
    let ativo = true
    const atualizar = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const r = await fetch("/api/painel/contadores", {
          cache: "no-store",
          credentials: "same-origin",
        })
        if (!r.ok) return
        const dados = (await r.json()) as {
          naoLidas?: number
          lista?: Pendencia[]
          em?: number
        }
        if (
          !ativo ||
          typeof dados.naoLidas !== "number" ||
          !Array.isArray(dados.lista) ||
          typeof dados.em !== "number"
        ) {
          return
        }
        const nova = { lista: dados.lista, em: dados.em }
        setEstado((e) => ({
          naoLidas: dados.naoLidas as number,
          pendencias: nova.em > e.pendencias.em ? nova : e.pendencias,
        }))
      } catch {
        // sem rede: fica o último valor
      }
    }
    const intervalo = window.setInterval(atualizar, INTERVALO_MS)
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void atualizar()
    }
    document.addEventListener("visibilitychange", aoVoltar)
    window.addEventListener("focus", aoVoltar)
    return () => {
      ativo = false
      window.clearInterval(intervalo)
      document.removeEventListener("visibilitychange", aoVoltar)
      window.removeEventListener("focus", aoVoltar)
    }
  }, [])

  const publicar = useCallback(
    (p: PendenciasCarimbadas) => setEstado((e) => (p.em > e.pendencias.em ? { ...e, pendencias: p } : e)),
    []
  )

  return <Contexto.Provider value={{ ...estado, publicar }}>{children}</Contexto.Provider>
}

/**
 * Pendências mais recentes entre as do provedor e as que a página trouxe
 * (`daPagina`). Navegar até o painel não re-renderiza o layout — só a
 * página —, então a lista da página pode ser a mais nova: nesse caso ela é
 * usada já nesta renderização e publicada no provedor, e o cabeçalho a
 * acompanha.
 */
export function usePendencias(daPagina?: PendenciasCarimbadas): Pendencia[] {
  const ctx = useContext(Contexto)
  const maisNovaNaPagina = !!daPagina && (!ctx || daPagina.em > ctx.pendencias.em)
  const publicar = ctx?.publicar
  useEffect(() => {
    if (maisNovaNaPagina && daPagina && publicar) publicar(daPagina)
  }, [maisNovaNaPagina, daPagina, publicar])
  if (maisNovaNaPagina) return daPagina.lista
  return ctx?.pendencias.lista ?? []
}

/** Sino e caixa de entrada do cabeçalho, lidos do provedor. */
export function ContadoresHeader() {
  const ctx = useContext(Contexto)
  const total = (ctx?.pendencias.lista ?? []).reduce((s, p) => s + p.quantidade, 0)
  return (
    <>
      <PendenciasIndicador total={total} />
      <SinoNotificacoes naoLidas={ctx?.naoLidas ?? 0} />
    </>
  )
}
