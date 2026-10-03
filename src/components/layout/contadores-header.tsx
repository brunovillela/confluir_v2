"use client"

import { useEffect, useState } from "react"

import { PendenciasIndicador } from "@/components/layout/pendencias-indicador"
import { SinoNotificacoes } from "@/components/layout/sino-notificacoes"

/** Intervalo da atualização em segundo plano, com a aba visível. */
const INTERVALO_MS = 60_000

/**
 * Sino e caixa de entrada do cabeçalho ATUALIZADOS SEM RECARREGAR (onda 2,
 * U3). O servidor renderiza os valores iniciais; daí em diante o componente
 * consulta /api/painel/contadores a cada minuto enquanto a aba está visível e
 * assim que ela volta ao foco. Falha de rede mantém o último valor.
 */
export function ContadoresHeader({ naoLidas, pendencias }: { naoLidas: number; pendencias: number }) {
  const [valores, setValores] = useState({ naoLidas, pendencias })
  // Navegação entre páginas traz valores novos do servidor: eles vencem
  // (ajuste de estado durante a renderização, sem efeito).
  const [doServidor, setDoServidor] = useState({ naoLidas, pendencias })
  if (doServidor.naoLidas !== naoLidas || doServidor.pendencias !== pendencias) {
    setDoServidor({ naoLidas, pendencias })
    setValores({ naoLidas, pendencias })
  }

  useEffect(() => {
    let ativo = true
    const atualizar = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const r = await fetch("/api/painel/contadores", { cache: "no-store", credentials: "same-origin" })
        if (!r.ok) return
        const dados = (await r.json()) as { naoLidas?: number; pendencias?: number }
        if (ativo && typeof dados.naoLidas === "number" && typeof dados.pendencias === "number") {
          setValores({ naoLidas: dados.naoLidas, pendencias: dados.pendencias })
        }
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

  return (
    <>
      <PendenciasIndicador total={valores.pendencias} />
      <SinoNotificacoes naoLidas={valores.naoLidas} />
    </>
  )
}
