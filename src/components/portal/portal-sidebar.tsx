"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeftRight, ChevronsUpDown, LogOut, UserRound } from "lucide-react"

import { Marca } from "@/components/marca"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { sairDoPortal } from "@/lib/actions/sessao"
import { iniciais } from "@/lib/texto"

import { useNaoLidos } from "./contador-avisos"
import { agruparNav, ativo, NAV_PORTAL, seloNaoLidos } from "./navegacao-portal"

/** Item do menu com alvo de 44px no toque (tablet deitado também passa de lg). */
const ALVO_TOQUE = "pointer-coarse:h-11"

/**
 * Menu lateral do portal do associado (lg+), no primitivo do painel: grupos
 * com rótulo, recolhe para ícones com dica, página atual marcada e o selo de
 * não lidos em Avisos. Abaixo de lg a casca nem mostra este componente (a
 * navegação é a barra inferior) e, abaixo de 768 px — onde o primitivo
 * viraria uma gaveta (Sheet) —, ele não desenha nada: o portal nunca abre o
 * menu por gaveta.
 */
export function PortalSidebar({
  entidade,
  ocultos,
  outrasAreas,
  preview,
  nomeAssociado,
}: {
  entidade: string
  /** Itens do menu que não valem para esta pessoa/entidade (Oposição, Hospedagem, Convênios). */
  ocultos: string[]
  /** Outras interfaces da mesma conta (painel, recepção, hotel). */
  outrasAreas: { titulo: string; href: string }[]
  preview: boolean
  nomeAssociado: string | null
}) {
  const pathname = usePathname()
  const { isMobile } = useSidebar()
  const naoLidos = useNaoLidos()

  if (isMobile) return null

  const grupos = agruparNav(NAV_PORTAL.filter((i) => !ocultos.includes(i.href)))

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" className="h-auto py-2 group-data-[collapsible=icon]:p-0!">
              <Link href="/portal/inicio" aria-label={`${entidade} — ir para o Início`}>
                <Marca variante="sidebar" tenant={entidade} />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {grupos.map(({ grupo, itens }) => (
          <SidebarGroup key={grupo ?? "topo"}>
            {grupo && <SidebarGroupLabel>{grupo}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {itens.map((item) => {
                  const atual = ativo(pathname, item.href)
                  const ehAvisos = item.href === "/portal/avisos"
                  const comSelo = ehAvisos && naoLidos > 0
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={atual}
                        tooltip={comSelo ? `${item.titulo} (${seloNaoLidos(naoLidos)} não lidos)` : item.titulo}
                        className={ALVO_TOQUE}
                      >
                        <Link
                          href={item.href}
                          aria-current={atual ? "page" : undefined}
                          aria-label={comSelo ? `${item.titulo}: ${naoLidos} não lidos` : undefined}
                        >
                          <item.icone />
                          <span>{item.titulo}</span>
                        </Link>
                      </SidebarMenuButton>
                      {comSelo && (
                        <>
                          {/* Par de tokens da própria lateral (navy nos dois temas); o
                              "!" segura a cor do número no hover/ativo do item. */}
                          <SidebarMenuBadge className="bg-sidebar-primary text-sidebar-primary-foreground! top-1/2! -translate-y-1/2 rounded-full">
                            {seloNaoLidos(naoLidos)}
                          </SidebarMenuBadge>
                          {/* Recolhida, o número some: fica um ponto sobre o ícone. */}
                          <span
                            aria-hidden
                            className="bg-sidebar-primary pointer-events-none absolute top-1 right-1 hidden size-2 rounded-full group-data-[collapsible=icon]:block"
                          />
                        </>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {preview ? (
              // Na visualização não há conta a gerir: só o nome de quem está
              // sendo visto. A saída é "Sair da visualização", na faixa do topo.
              nomeAssociado && (
                <div className="text-sidebar-foreground/80 flex min-w-0 items-center gap-2 px-2 py-1.5 text-xs group-data-[collapsible=icon]:hidden">
                  <UserRound className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{nomeAssociado}</span>
                </div>
              )
            ) : (
              // Conta num menu, como no painel: com as outras áreas e o Sair em
              // linhas soltas, o rodapé de quem também é funcionário passava de
              // 170 px e empurrava "Falar com o sindicato" para fora da tela.
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    tooltip={nomeAssociado ?? "Minha conta"}
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg text-xs">{iniciais(nomeAssociado)}</AvatarFallback>
                    </Avatar>
                    <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{nomeAssociado ?? "Minha conta"}</span>
                      <span className="truncate text-xs opacity-70">Minha conta</span>
                    </span>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side="right"
                  align="end"
                  sideOffset={4}
                >
                  {nomeAssociado && (
                    <DropdownMenuLabel className="truncate font-medium">{nomeAssociado}</DropdownMenuLabel>
                  )}
                  {outrasAreas.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                        Outras áreas desta conta
                      </DropdownMenuLabel>
                      {outrasAreas.map((area) => (
                        <DropdownMenuItem key={area.href} asChild className={ALVO_TOQUE}>
                          <Link href={area.href}>
                            <ArrowLeftRight />
                            {area.titulo}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <form action={sairDoPortal}>
                    <DropdownMenuItem variant="destructive" asChild className={ALVO_TOQUE}>
                      <button type="submit" className="w-full">
                        <LogOut />
                        Sair
                      </button>
                    </DropdownMenuItem>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
