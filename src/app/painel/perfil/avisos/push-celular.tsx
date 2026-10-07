"use client"

import { useEffect, useState } from "react"
import { BellRing, Loader2, Smartphone } from "lucide-react"

import { Button } from "@/components/ui/button"

type Estado = "carregando" | "sem_suporte" | "bloqueado" | "desligado" | "ligado" | "trabalhando"

function base64ParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const preenchido = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const bin = atob(preenchido.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * "Receber no celular" (onda 4, D2): liga o Web Push neste navegador. A
 * chave pública VAPID vem do build; sem ela o componente não é renderizado.
 */
export function PushCelular({ chavePublica, aparelhos }: { chavePublica: string; aparelhos: number }) {
  const [estado, setEstado] = useState<Estado>("carregando")
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    const verificar = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (ativo) setEstado("sem_suporte")
        return
      }
      if (Notification.permission === "denied") {
        if (ativo) setEstado("bloqueado")
        return
      }
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (ativo) setEstado(sub ? "ligado" : "desligado")
      } catch {
        if (ativo) setEstado("desligado")
      }
    }
    void verificar()
    return () => {
      ativo = false
    }
  }, [])

  const ligar = async () => {
    setErro(null)
    setEstado("trabalhando")
    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado")
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(chavePublica) })
      const r = await fetch("/api/push/assinar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ assinatura: sub.toJSON() }),
      })
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { erro?: string }
        await sub.unsubscribe().catch(() => undefined)
        setErro(d.erro ?? "Não foi possível ligar.")
        setEstado("desligado")
        return
      }
      setEstado("ligado")
    } catch (e) {
      setErro((e as Error).message)
      setEstado("desligado")
    }
  }

  const desligar = async () => {
    setErro(null)
    setEstado("trabalhando")
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/push/assinar", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setEstado("desligado")
    } catch (e) {
      setErro((e as Error).message)
      setEstado("ligado")
    }
  }

  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Smartphone className="text-muted-foreground size-4" />
        Receber no celular
      </p>
      <p className="text-muted-foreground text-xs">
        Os avisos marcados na coluna “Celular” abaixo aparecem neste aparelho, mesmo com o Confluir fechado. Instale o app pela
        opção &quot;Adicionar à tela inicial&quot; do navegador para ter o ícone na tela do celular.
        {aparelhos > 0 ? ` Ligado em ${aparelhos} aparelho${aparelhos === 1 ? "" : "s"}.` : ""}
      </p>
      {estado === "sem_suporte" && <p className="text-muted-foreground text-xs">Este navegador não recebe notificações push.</p>}
      {estado === "bloqueado" && (
        <p className="text-muted-foreground text-xs">As notificações estão bloqueadas nas configurações do navegador para este site.</p>
      )}
      {erro && <p className="text-destructive text-xs">{erro}</p>}
      <div>
        {estado === "ligado" ? (
          <Button type="button" variant="outline" size="sm" onClick={desligar}>
            Desligar neste aparelho
          </Button>
        ) : estado === "desligado" ? (
          <Button type="button" size="sm" onClick={ligar}>
            <BellRing />
            Ligar neste aparelho
          </Button>
        ) : estado === "carregando" || estado === "trabalhando" ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : null}
      </div>
    </div>
  )
}
