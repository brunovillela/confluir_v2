"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Um pedido de página nova por vez, mesmo com vários relógios na tela
 * cruzando o zero juntos (lista com duas assembleias que encerram às 18:00).
 */
let ultimaAtualizacao = 0

function atualizarUmaVez(atualizar: () => void) {
  if (Date.now() - ultimaAtualizacao < 5000) return
  ultimaAtualizacao = Date.now()
  atualizar()
}

/** setTimeout aceita até ~24,8 dias; além disso, ninguém mantém a aba aberta. */
const ESPERA_MAXIMA = 2 ** 31 - 1

/**
 * Contagem regressiva até um instante (ISO). Atualiza a cada segundo. Usada no
 * banner de assembleia online da área do filiado. Sem hidratação divergente:
 * só calcula depois de montar (o servidor renderiza o rótulo estático).
 *
 * Ao CRUZAR o zero com a tela aberta, pede ao servidor a página de novo
 * (router.refresh), uma vez só: é ele quem decide o que muda — a cédula e o
 * botão "Votar" somem quando a votação encerra, aparecem quando ela abre
 * (achado A93). Quem abre a página depois do instante não dispara nada: o
 * servidor já respondeu com o estado novo.
 */
export function ContagemRegressiva({
  ate,
  rotulo = "encerra",
  atualizarAoZerar = true,
  className,
}: {
  ate: string
  /** "encerra" (fim da votação) ou "abre" (início). */
  rotulo?: "encerra" | "abre"
  /** false quando a própria tela troca o conteúdo (ver EnquantoAberta). */
  atualizarAoZerar?: boolean
  className?: string
}) {
  const router = useRouter()
  const [restante, setRestante] = useState<number | null>(null)
  const viuAntesDoZero = useRef(false)

  useEffect(() => {
    const fim = new Date(ate).getTime()
    if (Number.isNaN(fim)) return
    const tick = () => {
      const r = Math.max(0, fim - Date.now())
      setRestante(r)
      if (r > 0) viuAntesDoZero.current = true
      else if (viuAntesDoZero.current && atualizarAoZerar) {
        viuAntesDoZero.current = false
        atualizarUmaVez(() => router.refresh())
      }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [ate, atualizarAoZerar, router])

  if (restante === null) return <span className={className}>calculando…</span>
  if (restante <= 0) {
    return <span className={className}>{rotulo === "abre" ? "abrindo…" : "encerrada"}</span>
  }

  const s = Math.floor(restante / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  const partes = d > 0 ? [`${d}d`, `${h}h`, `${m}m`] : [`${h}h`, `${m}m`, `${seg}s`]

  return (
    <span className={className}>
      {rotulo === "abre" ? "abre em" : "encerra em"}{" "}
      <span className="tabular-nums font-semibold">{partes.join(" ")}</span>
    </span>
  )
}

/**
 * Mostra `children` enquanto `ate` não chega; depois, `depois`. É o que tira o
 * botão "Votar agora" da tela quando a contagem zera — antes ele ficava ali,
 * ao lado de "encerrada", e o clique caía numa recusa que parecia erro de
 * cadastro (achado A93). O servidor renderiza `children` (só lista o que
 * está aberto); o relógio de quem abriu a tela decide depois de montar.
 */
export function EnquantoAberta({
  ate,
  children,
  depois,
}: {
  ate: string
  children: React.ReactNode
  depois: React.ReactNode
}) {
  const [encerrada, setEncerrada] = useState(false)

  useEffect(() => {
    const fim = new Date(ate).getTime()
    if (Number.isNaN(fim)) return
    const conferir = () => setEncerrada(Date.now() >= fim)
    conferir()
    const espera = fim - Date.now()
    if (espera <= 0 || espera > ESPERA_MAXIMA) return
    const t = setTimeout(conferir, espera + 250)
    return () => clearTimeout(t)
  }, [ate])

  return <>{encerrada ? depois : children}</>
}

/**
 * Sem nada na tela: quando `instante` chega com a página aberta, pede ao
 * servidor a página de novo. Serve ao "abre em": o botão de votar só existe
 * depois da abertura, e sem isto só aparecia recarregando à mão.
 */
export function AtualizarAo({ instante }: { instante: string }) {
  const router = useRouter()

  useEffect(() => {
    const espera = new Date(instante).getTime() - Date.now()
    if (Number.isNaN(espera) || espera <= 0 || espera > ESPERA_MAXIMA) return
    const t = setTimeout(() => atualizarUmaVez(() => router.refresh()), espera + 500)
    return () => clearTimeout(t)
  }, [instante, router])

  return null
}
