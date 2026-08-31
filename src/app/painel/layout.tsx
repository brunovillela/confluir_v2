import { AlertaForaJornada } from "@/components/layout/alerta-fora-jornada"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SinoNotificacoes } from "@/components/layout/sino-notificacoes"
import { TrilhaProvider } from "@/components/layout/trilha-rotulos"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { areasDaConta, requireSessaoPainel } from "@/lib/auth"
import { usuarioTemCaixa } from "@/lib/db/caixa"
import { contarNaoLidas } from "@/lib/db/notificacoes"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { jornadaDoUsuario } from "@/lib/db/pessoal-sst"
import { modulosPermitidos } from "@/lib/permissoes"

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const sessao = await requireSessaoPainel()
  const modulos = modulosPermitidos(sessao.permissoes)
  const [areas, naoLidas, temCaixa, organizacao, jornada] = await Promise.all([
    areasDaConta(),
    contarNaoLidas(sessao.usuario.id),
    usuarioTemCaixa(sessao.usuario.id),
    obterOrganizacao(),
    jornadaDoUsuario(sessao.usuario.id),
  ])
  const outrasAreas = areas.filter((a) => a.href !== "/painel")
  const tenantNome =
    organizacao?.nomeFantasia ?? organizacao?.nomeRazao ?? null

  const usuario = {
    nome: String(
      sessao.usuario.nome_completo ??
        sessao.usuario.nome_guerra ??
        sessao.user.email ??
        "Usuário"
    ),
    email: String(sessao.usuario.email ?? sessao.user.email ?? ""),
  }

  return (
    <SidebarProvider>
      <AppSidebar
        usuario={usuario}
        modulos={modulos}
        outrasAreas={outrasAreas}
        temCaixa={temCaixa}
        tenantNome={tenantNome}
      />
      <SidebarInset>
        <TrilhaProvider>
          <AppHeader acoes={<SinoNotificacoes naoLidas={naoLidas} />} />
          <AlertaForaJornada dias={jornada} />
          <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
            {children}
          </div>
        </TrilhaProvider>
      </SidebarInset>
    </SidebarProvider>
  )
}
