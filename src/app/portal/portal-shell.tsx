import Link from "next/link"
import { ArrowLeftRight, Bell, Eye } from "lucide-react"

import { Marca } from "@/components/marca"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { sairDoPortal } from "@/lib/actions/sessao"
import { encerrarVisualizacaoFiliado } from "@/lib/actions/visualizacao"
import { areasDaConta } from "@/lib/auth"
import { oposicaoRelevanteParaFiliado } from "@/lib/db/oposicao"
import { contarAvisosNaoLidos } from "@/lib/db/portal-avisos"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PortalNav, PortalNavInferior, type ItemNavPortal } from "./portal-nav"

const NAV: ItemNavPortal[] = [
  { titulo: "Início", href: "/portal/inicio" },
  { titulo: "Meu cadastro", href: "/portal/cadastro" },
  { titulo: "Carteirinha", href: "/portal/carteirinha" },
  { titulo: "Contribuição", href: "/portal/contribuicao" },
  { titulo: "Hospedagem", href: "/portal/hospedagem" },
  { titulo: "Convênios", href: "/portal/convenios" },
  { titulo: "Saúde", href: "/portal/saude" },
  { titulo: "Notícias", href: "/portal/noticias" },
  { titulo: "Eventos", href: "/portal/eventos" },
  { titulo: "Votação", href: "/portal/votacao" },
  { titulo: "Avisos", href: "/portal/avisos" },
  { titulo: "Oposição à contribuição", href: "/portal/oposicao" },
  { titulo: "LGPD", href: "/portal/lgpd" },
  { titulo: "Ajuda", href: "/portal/ajuda" },
]

/** Dados da visualização pela gestão (somente leitura). */
type Preview = { filiadoNome?: string | null; gestorNome?: string | null }

/**
 * A Oposição é um fluxo com sessão própria (do trabalhador), então na
 * visualização ela fica fora da navegação — menos quando tem a ver com ESTE
 * filiado: já houve oposição dele, ou a fonte pagadora onde ele trabalha tem
 * campanha aberta. Aí o atendente precisa ver a aba para falar dela.
 */
async function oposicaoNaNavegacao(cpf: string | null | undefined): Promise<boolean> {
  if (!cpf) return false
  return oposicaoRelevanteParaFiliado(cpf)
}

/**
 * Casca da área logada do portal do associado (onda 4, F5 — mobile-first):
 * cabeçalho com sino, navegação no topo em telas médias e barra inferior
 * no celular, com a página atual marcada nas duas.
 */
export async function PortalShell({
  children,
  preview,
}: {
  children: React.ReactNode
  preview?: Preview
}) {
  const vis = await getVisualizacaoPortal()
  const cpf = vis?.filiado.cpf ?? null

  // No modo visualização não mostra o alternador de interfaces (é da gestão,
  // não do filiado) nem a Oposição (fluxo público com sessão própria).
  const [outrasAreas, mostraOposicao, naoLidos] = await Promise.all([
    preview ? Promise.resolve([]) : areasDaConta().then((a) => a.filter((x) => x.href !== "/portal/inicio")),
    preview ? oposicaoNaNavegacao(cpf) : Promise.resolve(true),
    cpf ? contarAvisosNaoLidos(cpf) : Promise.resolve(0),
  ])
  const nav = mostraOposicao ? NAV : NAV.filter((i) => i.href !== "/portal/oposicao")

  return (
    <div className="flex min-h-svh flex-col">
      {preview && (
        <div className="border-warning/40 bg-warning/10 text-warning-fg border-b">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Eye className="size-4 shrink-0" />
              <span>
                Visualizando a área de{" "}
                <strong>{preview.filiadoNome ?? "filiado"}</strong> — somente
                leitura
                {preview.gestorNome ? ` · ${preview.gestorNome}` : ""}
              </span>
            </span>
            <form action={encerrarVisualizacaoFiliado}>
              <Button variant="outline" size="sm" type="submit">
                Sair da visualização
              </Button>
            </form>
          </div>
        </div>
      )}

      <header className="bg-background sticky top-0 z-10 border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <Marca variante="completa" />
          <div className="flex items-center gap-1 sm:gap-2">
            {outrasAreas.map((area) => (
              // No celular, as outras áreas ficam em "Mais" (barra inferior).
              <Button key={area.href} variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href={area.href}>
                  <ArrowLeftRight />
                  <span className="hidden md:inline">{area.titulo}</span>
                </Link>
              </Button>
            ))}
            <Button variant="ghost" size="icon" asChild className="relative size-11">
              <Link href="/portal/avisos" aria-label={naoLidos > 0 ? `Avisos: ${naoLidos} não lidos` : "Avisos"}>
                <Bell />
                {naoLidos > 0 && (
                  <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
                    {naoLidos > 99 ? "99+" : naoLidos}
                  </span>
                )}
              </Link>
            </Button>
            <ThemeToggle />
            {!preview && (
              <form action={sairDoPortal}>
                <Button variant="outline" size="sm" type="submit" className="min-h-9">
                  Sair
                </Button>
              </form>
            )}
          </div>
        </div>
        <PortalNav itens={nav} />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 pb-28 md:py-8">
        {children}
      </main>

      <PortalNavInferior itens={nav} naoLidos={naoLidos} outrasAreas={outrasAreas.map((a) => ({ titulo: a.titulo, href: a.href }))} />
    </div>
  )
}
