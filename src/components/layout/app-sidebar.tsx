"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeftRight,
  BookOpen,
  ChevronsUpDown,
  LogOut,
  UserRound,
  Wallet,
} from "lucide-react"

import { ICONES_MODULOS } from "@/components/layout/icones-modulos"
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { sairDoPainel } from "@/lib/actions/sessao"
import type { Modulo } from "@/lib/permissoes"
import { Marca } from "@/components/marca"

type UsuarioSidebar = {
  nome: string
  email: string
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] ?? "?"
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ""
  return (primeira + ultima).toUpperCase()
}

export function AppSidebar({
  usuario,
  modulos,
  outrasAreas = [],
  temCaixa = false,
}: {
  usuario: UsuarioSidebar
  modulos: Modulo[]
  /** Outras interfaces da conta (área do hotel, portal) — alternador. */
  outrasAreas?: { titulo: string; href: string }[]
  /** O usuário é responsável por uma conta de caixa (acesso destacado). */
  temCaixa?: boolean
}) {
  const pathname = usePathname()
  const { isMobile } = useSidebar()

  const [painel, ...restantes] = modulos

  const estaAtivo = (href: string) =>
    href === "/painel"
      ? pathname === "/painel"
      : pathname === href || pathname.startsWith(`${href}/`)

  const renderItem = (modulo: Modulo) => {
    const Icone = ICONES_MODULOS[modulo.icone]
    return (
      <SidebarMenuItem key={modulo.href}>
        <SidebarMenuButton
          asChild
          isActive={estaAtivo(modulo.href)}
          tooltip={modulo.titulo}
        >
          <Link href={modulo.href}>
            {Icone && <Icone />}
            <span className="text-[0.8125rem]">{modulo.titulo}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="h-auto py-2 group-data-[collapsible=icon]:p-0!"
            >
              <Link href="/painel">
                <Marca variante="sidebar" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{painel && renderItem(painel)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{restantes.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {/* Acessos utilitários, destacados dos módulos e levemente esmaecidos. */}
          {temCaixa && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={estaAtivo("/painel/perfil/caixa")}
                tooltip="Meu caixa"
                className="opacity-70"
              >
                <Link href="/painel/perfil/caixa">
                  <Wallet />
                  <span>Meu caixa</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={estaAtivo("/painel/ajuda")}
              tooltip="Manual"
              className="opacity-70"
            >
              <Link href="/painel/ajuda">
                <BookOpen />
                <span>Manual</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg text-xs">
                      {iniciais(usuario.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {usuario.nome}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {usuario.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="grid text-sm leading-tight">
                    <span className="truncate font-medium">
                      {usuario.nome}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {usuario.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/painel/perfil">
                    <UserRound />
                    Meu perfil
                  </Link>
                </DropdownMenuItem>
                {outrasAreas.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {outrasAreas.map((area) => (
                      <DropdownMenuItem key={area.href} asChild>
                        <Link href={area.href}>
                          <ArrowLeftRight />
                          {area.titulo}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <form action={sairDoPainel}>
                  <DropdownMenuItem variant="destructive" asChild>
                    <button type="submit" className="w-full">
                      <LogOut />
                      Sair
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
