"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BookOpen, CircleHelp, LifeBuoy, MessageSquarePlus, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { FeedbackDialog } from "@/components/layout/feedback-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ajudaDaRota, type EntradaAjuda } from "@/lib/ajuda/rota"

const CHAVE_VISTA = "confluir:novidades-vistas"

/**
 * MENU DE AJUDA (onda 2, U11/U12), o "?" do cabeçalho: o artigo do manual
 * sobre a tela atual, o manual inteiro, "O que há de novo" (com ponto
 * enquanto a última entrega não foi vista — e um aviso discreto na primeira
 * abertura depois de um deploy) e o canal para relatar problema ou sugerir.
 */
export function AjudaMenu({ mapa, novidadeId, novidadeTitulo }: { mapa: EntradaAjuda[]; novidadeId: string; novidadeTitulo: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [feedbackAberto, setFeedbackAberto] = useState(false)
  const [novidadeVista, setNovidadeVista] = useState(true)
  const artigo = ajudaDaRota(mapa, pathname)

  // Primeira abertura depois de uma entrega nova: um aviso, uma vez só.
  useEffect(() => {
    let vista: string | null = null
    try {
      vista = window.localStorage.getItem(CHAVE_VISTA)
    } catch {
      // sem storage: não avisa
      return
    }
    if (vista === novidadeId) return
    const timer = window.setTimeout(() => {
      setNovidadeVista(false)
      toast(`Novidades no Confluir: ${novidadeTitulo}`, {
        description: "Veja o que mudou nesta entrega.",
        action: { label: "Ver", onClick: () => router.push("/painel/novidades") },
        duration: 12_000,
      })
      try {
        window.localStorage.setItem(CHAVE_VISTA, novidadeId)
      } catch {
        // sem storage: avisa de novo na próxima
      }
    }, 800)
    return () => window.clearTimeout(timer)
  }, [novidadeId, novidadeTitulo, router])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Ajuda" className="relative">
            <CircleHelp />
            {!novidadeVista && <span className="bg-primary absolute top-1 right-1 size-2 rounded-full" aria-hidden />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem asChild>
            <Link href={artigo}>
              <LifeBuoy />
              Ajuda desta tela
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/painel/ajuda">
              <BookOpen />
              Manual completo
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/painel/novidades" onClick={() => setNovidadeVista(true)}>
              <Sparkles />
              O que há de novo
              {!novidadeVista && <span className="bg-primary ml-auto size-2 rounded-full" aria-hidden />}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setFeedbackAberto(true)}>
            <MessageSquarePlus />
            Relatar problema ou sugerir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FeedbackDialog aberto={feedbackAberto} aoFechar={() => setFeedbackAberto(false)} />
    </>
  )
}
