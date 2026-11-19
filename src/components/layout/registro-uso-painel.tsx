"use client"

import { useEffect } from "react"

const MINUTO = 60_000

/**
 * Registra o tempo de uso do painel de quem tem jornada vinculada — base do
 * relatório Pessoal › Controle de ponto › Uso fora do expediente. Manda um
 * sinal por minuto SÓ com a aba visível e com uso (teclado, mouse, toque ou
 * rolagem) no último minuto: aba esquecida aberta não conta. Não envia página
 * nem conteúdo. Para de vez se o servidor responder 410 (sem a tabela) ou
 * depois de 5 falhas seguidas.
 */
export function RegistroUsoPainel() {
  useEffect(() => {
    let ultimoUso = Date.now()
    let falhas = 0
    let parado = false
    // Timers acumulados (aba em segundo plano) disparam juntos: um envio por vez, no máximo um a cada 50 s.
    let ultimoEnvio = 0
    const marcar = () => {
      ultimoUso = Date.now()
    }
    const eventos = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const
    for (const e of eventos) window.addEventListener(e, marcar, { passive: true, capture: true })

    const enviar = async () => {
      if (parado || document.visibilityState !== "visible" || Date.now() - ultimoUso > MINUTO) return
      if (Date.now() - ultimoEnvio < 50_000) return
      ultimoEnvio = Date.now()
      try {
        const r = await fetch("/painel/uso", { method: "POST", keepalive: true, cache: "no-store" })
        if (r.status === 410) parado = true
        falhas = r.ok ? 0 : falhas + 1
      } catch {
        falhas++
      }
      if (falhas >= 5) parado = true
    }
    const timer = setInterval(enviar, MINUTO)
    return () => {
      clearInterval(timer)
      for (const e of eventos) window.removeEventListener(e, marcar, { capture: true })
    }
  }, [])
  return null
}
