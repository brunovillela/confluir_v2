"use client"

import { useEffect, useSyncExternalStore } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Lembra o último recorte de uma lista (filtros, busca, ordenação e página)
 * para o botão de voltar do registro abrir a lista como estava. Fica na aba
 * do navegador (sessionStorage): cada aba guarda o seu.
 */
const prefixo = (chave: string) => `confluir:lista:${chave}`

export function LembrarLista({ chave, url }: { chave: string; url: string }) {
  useEffect(() => {
    try {
      sessionStorage.setItem(prefixo(chave), url)
    } catch {
      // armazenamento bloqueado: o voltar cai no destino padrão
    }
  }, [chave, url])
  return null
}

const semAssinatura = () => () => {}

/**
 * Botão de voltar para a lista. Sem recorte guardado nesta aba, usa
 * `padrao` (destino e rótulo de sempre).
 */
export function VoltarLista({
  chave,
  base,
  rotulo,
  padrao = { href: base, rotulo },
}: {
  chave: string
  base: string
  rotulo: string
  padrao?: { href: string; rotulo: string }
}) {
  const salvo = useSyncExternalStore(
    semAssinatura,
    () => {
      try {
        const url = sessionStorage.getItem(prefixo(chave))
        if (url && url.startsWith(base)) return url
      } catch {
        // idem
      }
      return null
    },
    () => null
  )
  const destino = salvo ? { href: salvo, rotulo } : padrao
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
      <Link href={destino.href}>
        <ArrowLeft />
        {destino.rotulo}
      </Link>
    </Button>
  )
}
