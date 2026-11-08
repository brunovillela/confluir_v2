"use client"

/**
 * API de player do YouTube (IFrame API), carregada uma vez por página. Serve
 * ao vídeo de sensibilização da oposição — o relógio só anda com o vídeo
 * tocando — e ao painel, que lê a duração do vídeo para sugerir o tempo
 * mínimo (08/11/2026). Sem a API (bloqueada, sem rede), a promessa rejeita
 * depois de `limiteMs` e quem chama segue sem ela.
 */

export type PlayerYT = {
  getDuration(): number
  getCurrentTime(): number
  getPlayerState(): number
  destroy(): void
}

type ConstrutorPlayer = new (
  alvo: HTMLElement | string,
  opcoes: {
    videoId?: string
    width?: number
    height?: number
    playerVars?: Record<string, string | number>
    events?: {
      onReady?: (e: { target: PlayerYT }) => void
      onStateChange?: (e: { data: number; target: PlayerYT }) => void
      onError?: (e: { data: number }) => void
    }
  }
) => PlayerYT

type ApiYT = { Player: ConstrutorPlayer; PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number } }

declare global {
  interface Window {
    YT?: ApiYT
    onYouTubeIframeAPIReady?: () => void
  }
}

let carregando: Promise<ApiYT> | null = null

export function carregarYoutubeApi(limiteMs = 8000): Promise<ApiYT> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem janela"))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!carregando) {
    carregando = new Promise<ApiYT>((resolver, rejeitar) => {
      const anterior = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        anterior?.()
        if (window.YT?.Player) resolver(window.YT)
      }
      const script = document.createElement("script")
      script.src = "https://www.youtube.com/iframe_api"
      script.async = true
      script.onerror = () => rejeitar(new Error("API do YouTube indisponível"))
      document.head.appendChild(script)
    }).catch((e) => {
      carregando = null
      throw e
    })
  }
  return Promise.race([
    carregando,
    new Promise<ApiYT>((_, rejeitar) => setTimeout(() => rejeitar(new Error("API do YouTube demorou")), limiteMs)),
  ])
}

/** Id do YouTube de um id cru ou de uma URL (watch, youtu.be, embed, shorts). */
export function idDoYoutube(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)
  return m ? m[1] : null
}
