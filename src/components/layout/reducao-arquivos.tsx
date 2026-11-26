"use client"

import { useEffect } from "react"

import { reducoesPendentes, reduzirArquivosDoInput } from "@/lib/reducao-imagem"

/**
 * Reduz as fotos grandes escolhidas em QUALQUER campo de arquivo do sistema
 * (26/11/2026) — um ponto só, no layout raiz, em vez de cada formulário.
 *
 * - "change" (captura, na janela): ao escolher a foto, começa a redução e
 *   troca o arquivo do próprio input quando ela termina.
 * - "submit" (captura, na janela, antes do React): se ainda há redução em
 *   curso no formulário, segura o envio e o refaz quando ela termina — com o
 *   mesmo botão, para manter `formAction`/`name` de quem enviou.
 *
 * Campos que preparam a foto por conta própria levam `data-manter-original`.
 * Regras da redução em lib/reducao-imagem.ts; o servidor reduz de novo o que
 * chegar grande (lib/reducao-arquivo.ts).
 */
export function ReducaoDeArquivos() {
  useEffect(() => {
    function aoMudar(e: Event) {
      const alvo = e.target
      if (alvo instanceof HTMLInputElement && alvo.type === "file") reduzirArquivosDoInput(alvo)
    }

    function aoEnviar(e: SubmitEvent) {
      const form = e.target
      if (!(form instanceof HTMLFormElement)) return
      const pendentes = reducoesPendentes(form)
      if (pendentes.length === 0) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const botao = e.submitter
      void Promise.allSettled(pendentes).then(() => {
        if (!form.isConnected) return
        if (botao && "form" in botao && (botao as HTMLButtonElement).form === form && botao.isConnected) {
          form.requestSubmit(botao as HTMLButtonElement)
        } else {
          form.requestSubmit()
        }
      })
    }

    window.addEventListener("change", aoMudar, true)
    window.addEventListener("submit", aoEnviar, true)
    return () => {
      window.removeEventListener("change", aoMudar, true)
      window.removeEventListener("submit", aoEnviar, true)
    }
  }, [])
  return null
}
