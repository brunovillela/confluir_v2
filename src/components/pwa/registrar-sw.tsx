"use client"

import { useEffect } from "react"

/** Registra o service worker do PWA (public/sw.js). Silencioso onde não há suporte. */
export function RegistrarSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // sem service worker (navegador antigo, modo privado): o app funciona igual
    })
  }, [])
  return null
}
