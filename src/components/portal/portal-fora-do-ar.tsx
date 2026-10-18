"use client"

import Image from "next/image"
import { usePathname } from "next/navigation"
import { LogOut } from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { aoSairDoPortal } from "@/components/portal/sair-do-portal"
import { sairDoPortal } from "@/lib/actions/sessao"

import { ABERTOS_COM_PORTAL_FORA_DO_AR, ativo } from "./navegacao-portal"

/**
 * Portal inteiro fora do ar: a página de manutenção no lugar do conteúdo,
 * exceto nas rotas que continuam abertas (ABERTOS_COM_PORTAL_FORA_DO_AR —
 * a contribuição assistencial, sobretudo).
 *
 * A escolha é no cliente, pelo caminho atual, e não no layout: o layout não
 * re-renderiza ao navegar, então uma decisão tomada nele valeria para a
 * primeira página aberta e erraria nas seguintes (sair da Oposição para o
 * Início, ou o contrário). As páginas rodam no servidor de qualquer jeito
 * (um layout não impede o segmento de renderizar); as ações recusam pelo
 * bloqueioDaParte, então nada grava.
 */
export function PortalForaDoAr({ manutencao, children }: { manutencao: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname()
  const aberta = ABERTOS_COM_PORTAL_FORA_DO_AR.some((a) => ativo(pathname, a.href))
  return <>{aberta ? children : manutencao}</>
}

/**
 * Cabeçalho mínimo com o portal fora do ar: a entidade, o tema e "Sair" em
 * toda largura (sem a lateral, onde ele mora de lg em diante). Sem menu, sino
 * nem ajuda — tudo isso levaria à mesma página de manutenção. No "Ver como
 * filiado" não há "Sair": a saída é a faixa acima.
 */
export function CabecalhoForaDoAr({ entidade, preview }: { entidade: string; preview: boolean }) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-(--z-sticky) flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur md:px-6 lg:px-8 print:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <Image src="/logo-confluir-reduzida.png" alt="" width={40} height={40} className="size-8 shrink-0" />
        <span className="grid min-w-0 leading-tight">
          <span className="truncate text-sm font-semibold">{entidade}</span>
          <span className="text-muted-foreground truncate text-xs">Portal do Associado</span>
        </span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* O ThemeToggle não recebe className: o botão dele é o filho direto. */}
        <span className="contents [&>button]:size-11">
          <ThemeToggle />
        </span>
        {!preview && (
          <form action={sairDoPortal} onSubmit={aoSairDoPortal}>
            <Button type="submit" variant="ghost" className="h-11 px-3">
              <LogOut />
              Sair
            </Button>
          </form>
        )}
      </div>
    </header>
  )
}
