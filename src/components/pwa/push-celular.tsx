"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BellOff, BellRing, CheckCircle2, Loader2, Share } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

type Estado = "carregando" | "sem_suporte" | "instalar" | "bloqueado" | "desligado" | "ligado" | "trabalhando"

/** Rotas do servidor que guardam a assinatura — o painel e o portal têm as suas. */
export type RotasPush = {
  /** POST `{ assinatura }`: liga este aparelho para a conta logada. */
  assinar: string
  /** `{ endpoint }` no corpo: desliga este aparelho para a conta logada. */
  desassinar: string
  /** O painel desliga com DELETE na mesma rota; o portal, com POST em rota própria. */
  metodoDesassinar?: "POST" | "DELETE"
  /**
   * POST `{ endpoint }` → `{ ativo }`: confere no servidor se a assinatura que
   * o navegador tem é desta conta. O service worker é um só para painel e
   * portal, então a assinatura do navegador pode ser da outra área ou de outra
   * pessoa. Sem esta rota, vale a do navegador.
   */
  estado?: string
}

function base64ParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const preenchido = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const bin = atob(preenchido.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** iPhone/iPad (o iPadOS se apresenta como Mac, mas tem toque). */
function aparelhoApple(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
}

/** Aberto pelo ícone da tela de início (app instalado), não pela aba do navegador. */
function appInstalado(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** O service worker pronto — com prazo: se o registro falhou, `ready` nunca resolve. */
function swPronto(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new Error("sw")), 10_000)),
  ])
}

async function postJson(url: string, corpo: unknown, metodo: "POST" | "DELETE" = "POST"): Promise<Response> {
  return fetch(url, {
    method: metodo,
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(corpo),
  })
}

/** Mensagem para a pessoa, sem o texto técnico (em inglês) do navegador. */
function mensagemDeFalha(e: unknown): string {
  const nome = (e as { name?: string })?.name
  if (nome === "AbortError") return "O serviço de notificações do navegador não respondeu. Tente de novo em instantes."
  return "Não foi possível ligar neste aparelho. Tente de novo; se continuar, use outro navegador."
}

/**
 * "Receber no celular": liga o Web Push NESTE aparelho para a conta logada.
 * Comum ao painel e ao portal (A52) — cada um passa as suas rotas. A chave
 * pública VAPID vem do build; sem ela, a página não renderiza o componente.
 *
 * `cancelarNoNavegador`: ao desligar, cancela também a assinatura do
 * navegador. O portal passa `false` — o mesmo navegador pode estar ligado no
 * painel (mesmo service worker, mesma assinatura), e desligar lá apagaria aqui.
 */
export function PushCelular({
  chavePublica,
  rotas,
  cancelarNoNavegador = true,
  nomeApp = "o app",
}: {
  chavePublica: string
  rotas: RotasPush
  cancelarNoNavegador?: boolean
  /** Como chamar o app na instrução do iPhone ("o portal"). */
  nomeApp?: string
}) {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>("carregando")
  const [apple, setApple] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const urlEstado = rotas.estado

  useEffect(() => {
    let ativo = true
    const verificar = async () => {
      const ehApple = aparelhoApple()
      if (ativo) setApple(ehApple)
      // No iPhone, notificação de site só chega pelo app instalado na tela de
      // início (iOS 16.4+); na aba do Safari nem existe PushManager.
      if (ehApple && !appInstalado()) {
        if (ativo) setEstado("instalar")
        return
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (ativo) setEstado("sem_suporte")
        return
      }
      if (Notification.permission === "denied") {
        if (ativo) setEstado("bloqueado")
        return
      }
      try {
        const reg = await swPronto()
        const sub = await reg.pushManager.getSubscription()
        if (!sub) {
          if (ativo) setEstado("desligado")
          return
        }
        if (!urlEstado) {
          if (ativo) setEstado("ligado")
          return
        }
        const r = await postJson(urlEstado, { endpoint: sub.endpoint })
        const d = (await r.json().catch(() => ({}))) as { ativo?: boolean }
        if (ativo) setEstado(r.ok && d.ativo ? "ligado" : "desligado")
      } catch {
        if (ativo) setEstado("desligado")
      }
    }
    void verificar()
    return () => {
      ativo = false
    }
  }, [urlEstado])

  const ligar = async () => {
    setErro(null)
    setEstado("trabalhando")
    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado")
        return
      }
      const reg = await swPronto()
      const existente = await reg.pushManager.getSubscription()
      const opcoes = { userVisibleOnly: true, applicationServerKey: base64ParaBytes(chavePublica) }
      let sub: PushSubscription
      try {
        sub = await reg.pushManager.subscribe(opcoes)
      } catch (e) {
        // Assinatura antiga com outra chave (troca das chaves VAPID): o
        // navegador só aceita a nova depois de cancelar a velha.
        if ((e as { name?: string })?.name !== "InvalidStateError" || !existente) throw e
        await existente.unsubscribe()
        sub = await reg.pushManager.subscribe(opcoes)
      }
      const r = await postJson(rotas.assinar, { assinatura: sub.toJSON() })
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { erro?: string; refazer?: boolean }
        // Só cancela no navegador a assinatura criada agora: a que já existia
        // pode ser a da outra área, no mesmo navegador. Exceção: o serviço de
        // push recusou a assinatura (`refazer`) — morta para as duas áreas, e o
        // próximo "Ligar" devolveria a mesma se ela continuasse aqui.
        if (!existente || d.refazer) await sub.unsubscribe().catch(() => undefined)
        setErro(d.erro ?? "Não foi possível ligar neste aparelho.")
        setEstado("desligado")
        return
      }
      setEstado("ligado")
      router.refresh()
    } catch (e) {
      if ((e as { name?: string })?.name === "NotAllowedError") {
        setEstado("bloqueado")
        return
      }
      setErro(mensagemDeFalha(e))
      setEstado("desligado")
    }
  }

  const desligar = async () => {
    setErro(null)
    setEstado("trabalhando")
    try {
      const reg = await swPronto()
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const r = await postJson(rotas.desassinar, { endpoint: sub.endpoint }, rotas.metodoDesassinar ?? "POST")
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { erro?: string }
          setErro(d.erro ?? "Não foi possível desligar agora. Tente de novo.")
          setEstado("ligado")
          return
        }
        if (cancelarNoNavegador) await sub.unsubscribe()
      }
      setEstado("desligado")
      router.refresh()
    } catch {
      setErro("Não foi possível desligar agora. Tente de novo.")
      setEstado("ligado")
    }
  }

  return (
    <div className="grid gap-3" aria-live="polite">
      {(estado === "carregando" || estado === "trabalhando") && (
        <p className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {estado === "carregando" ? "Conferindo este aparelho…" : "Um momento…"}
        </p>
      )}

      {estado === "ligado" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-success-fg flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            Ligado neste aparelho
          </p>
          <Button type="button" variant="outline" className="min-h-11" onClick={desligar}>
            <BellOff />
            Desligar neste aparelho
          </Button>
        </div>
      )}

      {estado === "desligado" && (
        <div>
          <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={ligar}>
            <BellRing />
            Ligar neste aparelho
          </Button>
        </div>
      )}

      {estado === "instalar" && (
        <Alert variant="info">
          <Share aria-hidden />
          <AlertTitle>No iPhone, instale {nomeApp} primeiro</AlertTitle>
          <AlertDescription>
            No Safari, toque em Compartilhar (o quadrado com a seta para cima) e depois em “Adicionar à Tela de Início”.
            Abra {nomeApp} pelo ícone novo e volte a esta tela para ligar.
          </AlertDescription>
        </Alert>
      )}

      {estado === "bloqueado" && (
        <Alert variant="warning">
          <BellOff aria-hidden />
          <AlertTitle>Notificações bloqueadas neste navegador</AlertTitle>
          <AlertDescription>
            Para liberar, abra as configurações do site (o cadeado ao lado do endereço, ou as configurações do
            navegador), permita as notificações e volte a esta tela.
          </AlertDescription>
        </Alert>
      )}

      {estado === "sem_suporte" && (
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          {apple
            ? "Este aparelho ainda não recebe notificações de sites: atualize o sistema (iOS 16.4 ou mais novo)."
            : "Este navegador não recebe notificações. Use o Chrome, o Edge, o Firefox ou o Safari atualizado."}
        </p>
      )}

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
