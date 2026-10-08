"use client"

import { useEffect, useSyncExternalStore } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Lembra a última lista de ordens (filtros, busca, ordenação e página) para o
 * botão "Ordens de pagamento" da ordem voltar ao mesmo recorte. Fica na aba
 * do navegador (sessionStorage): cada aba guarda o seu.
 */
const CHAVE = "confluir:ordens:lista"
const BASE = "/painel/financeiro/ordens"

export function LembrarListaOrdens({ url }: { url: string }) {
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE, url)
    } catch {
      // armazenamento bloqueado: o voltar cai na lista sem filtro
    }
  }, [url])
  return null
}

function lerSalvo(): string {
  try {
    const salvo = sessionStorage.getItem(CHAVE)
    if (salvo && salvo.startsWith(BASE)) return salvo
  } catch {
    // idem
  }
  return BASE
}

const semAssinatura = () => () => {}

export function VoltarListaOrdens() {
  const href = useSyncExternalStore(semAssinatura, lerSalvo, () => BASE)
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
      <Link href={href}>
        <ArrowLeft />
        Ordens de pagamento
      </Link>
    </Button>
  )
}
