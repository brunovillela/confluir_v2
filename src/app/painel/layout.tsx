import { AlertaForaJornada } from "@/components/layout/alerta-fora-jornada"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AjudaMenu } from "@/components/layout/ajuda-menu"
import { BuscaGlobal } from "@/components/layout/busca-global"
import { ContadoresHeader } from "@/components/layout/contadores-header"
import { TrilhaProvider } from "@/components/layout/trilha-rotulos"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { mapaAjuda } from "@/lib/ajuda/rota"
import { areasDaConta, requireSessaoPainel } from "@/lib/auth"
import { NOVIDADES } from "@/lib/novidades"
import { usuarioTemCaixa } from "@/lib/db/caixa"
import { ocupantesAtuais } from "@/lib/db/contas-funcao"
import { contarNaoLidas } from "@/lib/db/notificacoes"
import { pendenciasDoUsuario, totalPendencias } from "@/lib/db/pendencias"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { urlFoto } from "@/lib/db/perfil"
import { jornadaDoUsuario } from "@/lib/db/pessoal-sst"
import { MODULOS, modulosPermitidos, podeAcessarModulo } from "@/lib/permissoes"

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const sessao = await requireSessaoPainel()
  const modulos = modulosPermitidos(sessao.permissoes)
  // Busca global (Ctrl+K): toda página que a pessoa pode abrir, inclusive as
  // subáreas ocultas do menu (só título, descrição, rota e ícone).
  const paginasDaBusca = MODULOS.filter((m) => podeAcessarModulo(sessao.permissoes, m)).map((m) => ({
    titulo: m.titulo,
    href: m.href,
    descricao: m.descricao,
    icone: m.icone,
  }))
  const contaFuncao = sessao.usuario.conta_funcao === true
  const [areas, naoLidas, temCaixa, organizacao, jornada, fotoUrl, ocupantes, pendencias] = await Promise.all([
    areasDaConta(),
    contarNaoLidas(sessao.usuario.id),
    usuarioTemCaixa(sessao.usuario.id),
    obterOrganizacao(),
    jornadaDoUsuario(sessao.usuario.id),
    urlFoto(typeof sessao.usuario.foto === "string" ? sessao.usuario.foto : null),
    contaFuncao ? ocupantesAtuais([sessao.usuario.id]) : Promise.resolve(null),
    pendenciasDoUsuario(sessao).catch(() => []),
  ])
  // Conta de função (ex.: Recepção): no lugar do e-mail, quem está no posto —
  // lembrete de registrar a troca quando o nome não é o de quem está usando.
  const ocupante = ocupantes?.get(sessao.usuario.id)
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
    email: contaFuncao
      ? ocupante
        ? `No posto: ${ocupante}`
        : "Ninguém registrado no posto"
      : String(sessao.usuario.email ?? sessao.user.email ?? ""),
    fotoUrl,
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
          {/* Header e alerta grudam JUNTOS, como um bloco só. Cada um sticky
              por conta própria fixava os dois em top-0 e o alerta cobria o
              cabeçalho — texto por cima de texto assim que a página rolava. */}
          <div className="bg-background sticky top-0 z-(--z-sticky)">
            <AppHeader
              acoes={
                <>
                  <BuscaGlobal paginas={paginasDaBusca} />
                  <AjudaMenu mapa={mapaAjuda()} novidadeId={NOVIDADES[0].id} novidadeTitulo={NOVIDADES[0].titulo} />
                  <ContadoresHeader naoLidas={naoLidas} pendencias={totalPendencias(pendencias)} />
                </>
              }
            />
            <AlertaForaJornada dias={jornada} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
            {children}
          </div>
        </TrilhaProvider>
      </SidebarInset>
    </SidebarProvider>
  )
}
