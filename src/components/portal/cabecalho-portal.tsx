"use client"

import { useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Bell, CircleHelp, LogOut, PanelLeft } from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useSidebar } from "@/components/ui/sidebar"
import { sairDoPortal } from "@/lib/actions/sessao"
import { ajudaDaRotaPortal, INDICE_AJUDA_PORTAL, type EntradaAjudaPortal } from "@/lib/ajuda/mapa-portal"

import { useNaoLidos } from "./contador-avisos"
import { ativo, seloNaoLidos, tituloDaSecao } from "./navegacao-portal"

/**
 * Cabeçalho da casca do portal (sticky). Todos os controles têm 44 px (A137).
 *  - Abaixo de lg: marca da ENTIDADE levando ao Início (A31) e o nome da
 *    seção atual (A174) — no celular o título da página rola para fora e a
 *    barra inferior só acende quatro seções.
 *  - De lg em diante: botão que recolhe a lateral e a identificação da
 *    entidade (a seção atual já fica marcada na lateral).
 *  - À direita: "?" com a ajuda da seção atual (A136), sino com o selo de não
 *    lidos (em toda largura), tema e, abaixo de lg, "Sair" — de lg em diante
 *    ele fica no menu da conta, no rodapé da lateral. Na visualização da
 *    gestão não há "Sair": a saída é a faixa acima.
 */
export function CabecalhoPortal({
  entidade,
  preview,
  mapaAjuda,
}: {
  entidade: string
  preview: boolean
  /** Seção → artigo da ajuda, montado no layout (ver lib/ajuda/mapa-portal.ts). */
  mapaAjuda: EntradaAjudaPortal[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const naoLidos = useNaoLidos()

  // A tela de entrada (/portal) manda para o Início quem tem sessão, então ela
  // só abre DENTRO da casca quando a sessão acabou no meio do caminho (o proxy
  // ou a página redirecionou numa navegação no cliente, que não re-renderiza
  // o layout). O refresh refaz o layout — agora sem casca.
  useEffect(() => {
    if (pathname === "/portal") router.refresh()
  }, [pathname, router])

  const noInicio = ativo(pathname, "/portal/inicio")
  const titulo = noInicio ? null : tituloDaSecao(pathname)

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-(--z-sticky) flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur md:px-6 lg:px-8 print:hidden">
      <BotaoMenuLateral />
      <Separator orientation="vertical" className="hidden h-5! self-center lg:block" />
      <p className="hidden min-w-0 truncate text-sm lg:block">
        <span className="font-medium">{entidade}</span>
        <span className="text-muted-foreground"> · Portal do Associado</span>
      </p>

      <Link
        href="/portal/inicio"
        aria-label={`${entidade} — ir para o Início`}
        className="focus-visible:ring-ring/50 flex min-h-11 min-w-0 shrink-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 sm:max-w-56 lg:hidden"
      >
        <Image src="/logo-confluir-reduzida.png" alt="" width={40} height={40} className="size-8 shrink-0" />
        <span className="hidden min-w-0 leading-tight sm:grid">
          <span className="truncate text-sm font-semibold">{entidade}</span>
          <span className="text-muted-foreground truncate text-xs">Portal do Associado</span>
        </span>
      </Link>
      {titulo ? (
        <>
          <Separator orientation="vertical" className="hidden h-5! self-center sm:block lg:hidden" />
          <span className="min-w-0 truncate text-sm font-medium lg:hidden">{titulo}</span>
        </>
      ) : (
        // No Início do celular (só o símbolo à esquerda), o nome da entidade.
        noInicio && <span className="min-w-0 truncate text-sm font-medium sm:hidden">{entidade}</span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <BotaoAjuda mapa={mapaAjuda} pathname={pathname} />
        <Button variant="ghost" size="icon" asChild className="relative size-11">
          <Link
            href="/portal/avisos"
            aria-label={naoLidos > 0 ? `Avisos: ${naoLidos} não lidos` : "Avisos"}
            aria-current={ativo(pathname, "/portal/avisos") ? "page" : undefined}
          >
            <Bell />
            {naoLidos > 0 && (
              <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
                {seloNaoLidos(naoLidos)}
              </span>
            )}
          </Link>
        </Button>
        {/* O ThemeToggle não recebe className: o botão dele é o filho direto. */}
        <span className="contents [&>button]:size-11">
          <ThemeToggle />
        </span>
        {!preview && (
          <form action={sairDoPortal} className="lg:hidden">
            <Button type="submit" variant="ghost" className="h-11 px-3">
              <LogOut className="hidden sm:block" />
              Sair
            </Button>
          </form>
        )}
      </div>
    </header>
  )
}

/**
 * "?" que leva ao artigo da ajuda sobre a seção atual (A136) — ou ao índice,
 * quando a seção não tem artigo. Link direto, sem menu: o portal não tem
 * "Novidades" nem canal de sugestão como o painel. Some dentro da própria
 * ajuda, que já tem a navegação do manual ao lado.
 */
function BotaoAjuda({ mapa, pathname }: { mapa: EntradaAjudaPortal[]; pathname: string }) {
  if (ativo(pathname, INDICE_AJUDA_PORTAL)) return null
  const { href, titulo } = ajudaDaRotaPortal(mapa, pathname)
  return (
    <Button variant="ghost" size="icon" asChild className="size-11">
      <Link href={href} aria-label={titulo ? `Ajuda sobre ${titulo}` : "Ajuda do portal"}>
        <CircleHelp />
      </Link>
    </Button>
  )
}

/** Recolhe/expande a lateral (só existe de lg em diante). */
function BotaoMenuLateral() {
  const { open, toggleSidebar } = useSidebar()
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      aria-label={open ? "Recolher o menu" : "Expandir o menu"}
      className="-ml-2 hidden size-11 lg:inline-flex"
    >
      <PanelLeft />
    </Button>
  )
}
