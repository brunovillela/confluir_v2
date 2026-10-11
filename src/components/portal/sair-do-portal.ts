"use client"

import type { FormEvent } from "react"

import { sairDoPortal } from "@/lib/actions/sessao"

/**
 * Antes de sair, desliga o push DESTE aparelho para o associado (A52). Sem
 * isso, num celular ou computador compartilhado a pessoa anterior continuava
 * recebendo as notificações dela — com o texto do aviso na tela bloqueada —
 * até outra pessoa ligar o push ali. Só a associação do portal sai (a rota
 * apaga a assinatura pelo CPF da sessão); a do painel, no mesmo navegador,
 * continua. Nunca impede a saída: falha ou demora (2 s) seguem para o Sair.
 */
async function desligarPushDoAparelho(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return
    const registro = await navigator.serviceWorker.getRegistration()
    const assinatura = await registro?.pushManager.getSubscription()
    if (!assinatura) return
    const limite = new AbortController()
    const relogio = setTimeout(() => limite.abort(), 2000)
    await fetch("/api/portal/push/desassinar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: assinatura.endpoint }),
      signal: limite.signal,
      keepalive: true,
    }).catch(() => {})
    clearTimeout(relogio)
  } catch {
    // Sem push neste navegador ou SQL ainda não rodado: nada a desligar.
  }
}

/**
 * onSubmit do formulário de Sair do portal. O formulário continua com
 * action={sairDoPortal} (funciona sem JavaScript); com JavaScript, o envio
 * normal é trocado por: desligar o push do aparelho e então chamar a ação.
 * Chamada direta, e não requestSubmit: o Sair da lateral fica num menu que se
 * fecha no clique e desmontaria o formulário antes do reenvio.
 */
export function aoSairDoPortal(e: FormEvent<HTMLFormElement>): void {
  e.preventDefault()
  void desligarPushDoAparelho().then(() => sairDoPortal())
}
