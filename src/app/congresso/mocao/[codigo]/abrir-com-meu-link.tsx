"use client"

import Link from "next/link"
import { useSyncExternalStore } from "react"
import { PenLine } from "lucide-react"

import { Button } from "@/components/ui/button"

export const CHAVE_LINK = "confluir-congresso-link"

function lerToken(): string | null {
  try {
    const t = window.localStorage.getItem(CHAVE_LINK)
    return t && /^[A-Za-z0-9_-]{20,64}$/.test(t) ? t : null
  } catch {
    return null
  }
}

/**
 * O link pessoal fica guardado no aparelho quando a pessoa o abre; aqui,
 * lido o QR da moção, um toque leva à tela de assinar.
 */
export function AbrirComMeuLink({ codigo }: { codigo: string }) {
  const token = useSyncExternalStore(
    () => () => {},
    lerToken,
    () => null
  )
  if (token) {
    return (
      <Button asChild className="h-12 justify-self-start text-base">
        <Link href={`/congresso/eu/${token}/mocao/${codigo}`}>
          <PenLine />
          Ler e assinar
        </Link>
      </Button>
    )
  }
  return (
    <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
      Para assinar, abra antes o seu <strong>link pessoal</strong> do congresso neste aparelho (o que você recebeu na inscrição) e leia este QR
      de novo — ou use &quot;Ler QR de moção&quot; na própria página do link. Sem celular? Assine na estação da mesa, com o crachá.
    </p>
  )
}
