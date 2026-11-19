"use client"

import { useEffect, useState } from "react"

import { codigoSalaAction } from "../../../dia-actions"

/**
 * Telão do código da sala: o QR muda a cada poucos segundos. Quem está na sala
 * lê com o celular, na página do link pessoal, e a presença fica registrada
 * com prova de que a pessoa via a tela naquele momento (nível C).
 */
export function Telao({ congressoId, sessaoId }: { congressoId: string; sessaoId: string }) {
  const [qr, setQr] = useState<string | null>(null)
  const [codigo, setCodigo] = useState("")
  const [restante, setRestante] = useState(0)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    let ate = 0
    let timer: ReturnType<typeof setTimeout>
    const buscar = async () => {
      try {
        const r = await codigoSalaAction({ congressoId, sessaoId })
        if (!vivo) return
        if (r.erro) {
          setErro(r.erro)
          return
        }
        setErro(null)
        setQr(r.qr ?? null)
        setCodigo(r.codigo ?? "")
        ate = r.validoAte ?? Date.now() + 10000
      } catch {
        if (vivo) setErro("Sem conexão: o código não está sendo atualizado.")
        ate = Date.now() + 5000
      }
      timer = setTimeout(buscar, Math.max(1000, ate - Date.now() + 300))
    }
    buscar()
    const relogio = setInterval(() => setRestante(Math.max(0, Math.ceil((ate - Date.now()) / 1000))), 500)
    return () => {
      vivo = false
      clearTimeout(timer)
      clearInterval(relogio)
    }
  }, [congressoId, sessaoId])

  return (
    <div className="flex flex-col items-center gap-4">
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="Código da sala" className="aspect-square w-[min(70vh,90vw)] rounded-xl bg-white p-4" />
      ) : (
        <div className="bg-muted aspect-square w-[min(70vh,90vw)] animate-pulse rounded-xl" />
      )}
      <div className="font-mono text-5xl font-semibold tracking-[0.3em]">{codigo}</div>
      <div className="text-muted-foreground text-sm">Muda em {restante}s</div>
      {erro && <div className="text-destructive text-sm">{erro}</div>}
    </div>
  )
}
