"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

/**
 * Barra de progresso GLOBAL de navegação.
 *
 * O problema que ela resolve: rotas do painel são dinâmicas (dependem de
 * sessão/permissão), então o Next não consegue pré-buscar a página inteira —
 * ao clicar num link, o navegador espera a resposta do servidor ainda
 * mostrando a tela antiga. Sem sinal nenhum, o usuário acha que não clicou e
 * clica de novo.
 *
 * Em vez de tocar nos ~300 links do sistema, escuta o clique no nível do
 * documento (fase de captura) e liga a barra quando o destino é uma navegação
 * interna de verdade. Desliga quando a rota (pathname + query) muda — ou seja,
 * quando a página nova realmente apareceu.
 *
 * Complementar ao `loading.tsx`: aquele cobre o corpo da página depois que a
 * navegação começou; esta dá o retorno imediato do clique.
 */
export function ProgressoNavegacao() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [ativo, setAtivo] = useState(false)
  // rota em que a barra foi ligada — só desliga quando de fato mudou
  const rotaAoClicar = useRef<string | null>(null)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rotaAtual = `${pathname}?${searchParams}`

  useEffect(() => {
    function aoClicar(evento: MouseEvent) {
      // só clique simples com o botão principal (ctrl/cmd/shift abrem noutra aba)
      if (
        evento.defaultPrevented ||
        evento.button !== 0 ||
        evento.metaKey ||
        evento.ctrlKey ||
        evento.shiftKey ||
        evento.altKey
      ) {
        return
      }
      const alvo = (evento.target as HTMLElement | null)?.closest("a")
      if (!alvo) return

      const href = alvo.getAttribute("href")
      if (
        !href ||
        alvo.target === "_blank" ||
        alvo.hasAttribute("download") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return
      }

      // externo (outro domínio) sai do app — o navegador já dá o próprio sinal
      const destino = new URL(href, window.location.href)
      if (destino.origin !== window.location.origin) return

      // âncora na mesma página não é navegação
      const rotaDestino = `${destino.pathname}?${destino.searchParams}`
      if (rotaDestino === rotaAtual) return

      rotaAoClicar.current = rotaAtual
      setAtivo(true)

      // rede de segurança: se algo travar, a barra não fica eterna
      if (timeout.current) clearTimeout(timeout.current)
      timeout.current = setTimeout(() => setAtivo(false), 15000)
    }

    document.addEventListener("click", aoClicar, { capture: true })
    return () => {
      document.removeEventListener("click", aoClicar, { capture: true })
    }
  }, [rotaAtual])

  // a rota mudou → a página nova chegou
  useEffect(() => {
    if (rotaAoClicar.current !== null && rotaAoClicar.current !== rotaAtual) {
      rotaAoClicar.current = null
      setAtivo(false)
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [rotaAtual])

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  if (!ativo) return null

  return (
    <div
      role="progressbar"
      aria-label="Carregando a página"
      aria-busy="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
    >
      <div className="bg-primary h-full w-full origin-left animate-[progresso-navegacao_12s_cubic-bezier(0.1,0.9,0.2,1)_forwards]" />
    </div>
  )
}
