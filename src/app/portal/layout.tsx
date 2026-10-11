import type { Metadata } from "next"
import { cookies } from "next/headers"
import { Eye } from "lucide-react"

import { BarraInferiorPortal } from "@/components/portal/barra-inferior-portal"
import { CabecalhoPortal } from "@/components/portal/cabecalho-portal"
import { ContadorAvisosProvider } from "@/components/portal/contador-avisos"
import { PortalSidebar } from "@/components/portal/portal-sidebar"
import { PularParaConteudo } from "@/components/portal/pular-para-conteudo"
import { RegistrarSw } from "@/components/pwa/registrar-sw"
import { Button } from "@/components/ui/button"
import { SidebarProvider } from "@/components/ui/sidebar"
import { encerrarVisualizacaoFiliado } from "@/lib/actions/visualizacao"
import { mapaAjudaPortal } from "@/lib/ajuda/mapa-portal"
import { areasDaConta } from "@/lib/auth"
import { listarConvenios } from "@/lib/db/filiacao-convenios"
import { hoteisDisponiveis } from "@/lib/db/filiado-portal"
import { oposicaoRelevanteParaFiliado } from "@/lib/db/oposicao"
import { nomeEntidade } from "@/lib/db/organizacao"
import { contarAvisosNaoLidos } from "@/lib/db/portal-avisos"
import { cn } from "@/lib/utils"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Manifest do PWA do portal no lugar do herdado do RootLayout (que é o do
 * painel): quem instala o app por aqui abre em /portal/inicio, não no login
 * dos funcionários (A56). O manifest mora fora de /portal — ver
 * src/app/manifest-portal.webmanifest/route.ts.
 */
export const metadata: Metadata = {
  manifest: "/manifest-portal.webmanifest",
}

/** Estado aberto/recolhido da lateral do portal — separado do `sidebar_state` do painel. */
const COOKIE_LATERAL = "portal_sidebar"

/** Teto do conteúdo (A27): 1280 px, 1536 px em telas 2xl, com respiro por largura. */
const CONTAINER = "mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8 2xl:max-w-8xl"

/**
 * Casca do portal do associado (onda 1 da avaliação de 11/10/2026: A18, A27,
 * A65, A67). Antes cada página montava o PortalShell à mão — a que esquecia
 * expulsava o atendente da visualização, o erro perdia o menu e não havia
 * loading. Agora a casca é deste layout e as páginas devolvem só o conteúdo.
 *
 * Quem ganha a casca: quem getVisualizacaoPortal() reconhece — o filiado
 * logado ou a gestão em "Ver como filiado" (faixa no topo, sem "Sair"). Sem
 * isso, só os filhos: a tela de entrada (/portal, que manda para o Início
 * quem já está dentro) e a Oposição do trabalhador não filiado, que tem
 * fluxo público próprio.
 *
 * Navegação: lateral fixa de lg em diante e barra inferior abaixo disso (o
 * primitivo da lateral vira gaveta abaixo de 768 px; o portal nunca a abre).
 *
 * O layout NÃO re-renderiza ao navegar entre as páginas do portal: as
 * consultas abaixo rodam uma vez por carregamento (entrada, recarga ou envio
 * de formulário que redireciona), e cada uma tem saída segura — na dúvida, o
 * item do menu aparece. O selo de não lidos acompanha a página de avisos pelo
 * ContadorAvisosProvider (ver contador-avisos.tsx).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const vis = await getVisualizacaoPortal()
  if (!vis) return children

  const preview = vis.preview ? vis : null
  const cpf = vis.filiado.cpf

  const [entidade, outrasAreas, naoLidos, mostraOposicao, temHotel, temConvenio, jar] = await Promise.all([
    nomeEntidade(),
    // O alternador de interfaces é da conta logada: na visualização seria o da gestão.
    preview
      ? Promise.resolve([])
      : areasDaConta()
          .then((a) => a.filter((x) => x.href !== "/portal/inicio"))
          .catch(() => []),
    contarAvisosNaoLidos(cpf).catch(() => 0),
    // Contribuição assistencial só para quem tem a ver com ela: oposição já
    // registrada ou campanha no prazo que alcança a fonte dele (A125).
    oposicaoRelevanteParaFiliado(cpf).catch(() => true),
    // Sem hotel ou convênio vigente na entidade, o item sai do menu (A57). A
    // rota continua aberta: links de aviso e histórico de cupons seguem valendo.
    hoteisDisponiveis()
      .then((l) => l.length > 0)
      .catch(() => true),
    listarConvenios({ somenteVigentes: true })
      .then((l) => l.length > 0)
      .catch(() => true),
    cookies(),
  ])

  const ocultos = [
    !mostraOposicao && "/portal/oposicao",
    !temHotel && "/portal/hospedagem",
    !temConvenio && "/portal/convenios",
  ].filter((h): h is string => typeof h === "string")
  const lateralAberta = jar.get(COOKIE_LATERAL)?.value !== "false"

  return (
    <ContadorAvisosProvider naoLidos={naoLidos}>
      <SidebarProvider cookieName={COOKIE_LATERAL} defaultOpen={lateralAberta}>
        <PularParaConteudo />
        <RegistrarSw />
        {/* Lateral só de lg em diante: entre 768 e 1023 px ela deixaria metade
            da tela para o conteúdo — ali a navegação é a barra inferior. */}
        {/* print:hidden! também tira a reserva de espaço da lateral (sidebar-gap)
            na impressão — o comprovante sairia com uma faixa vazia à esquerda. */}
        <div className="hidden lg:contents print:hidden!">
          <PortalSidebar
            entidade={entidade}
            ocultos={ocultos}
            outrasAreas={outrasAreas}
            preview={Boolean(preview)}
            nomeAssociado={vis.filiado.nome_completo}
          />
        </div>

        {/* Coluna do conteúdo (o papel do SidebarInset, que é um <main>: aqui o
            <main> é só o conteúdo, alvo do "Pular para o conteúdo"). */}
        <div className="bg-background relative flex w-full min-w-0 flex-1 flex-col">
          {preview && (
            <div className="border-warning/40 bg-warning/10 text-warning-fg border-b print:hidden">
              <div className={cn(CONTAINER, "flex flex-wrap items-center justify-between gap-2 py-2 text-sm")}>
                <span className="flex items-center gap-2">
                  <Eye className="size-4 shrink-0" aria-hidden />
                  <span>
                    Visualizando a área de <strong>{preview.filiado.nome_completo ?? "filiado"}</strong> — somente
                    leitura
                    {preview.gestorNome ? ` · ${preview.gestorNome}` : ""}
                  </span>
                </span>
                <form action={encerrarVisualizacaoFiliado}>
                  <Button variant="outline" type="submit">
                    Sair da visualização
                  </Button>
                </form>
              </div>
            </div>
          )}

          <CabecalhoPortal entidade={entidade} preview={Boolean(preview)} mapaAjuda={mapaAjudaPortal()} />

          {/* pb-28: abaixo de lg a barra inferior fixa cobre o fim da página.
              scroll-mt-14: ao receber o foco do "Pular para o conteúdo" com a
              página rolada, o topo não fica sob o cabeçalho sticky (h-14). */}
          <main
            id="conteudo"
            tabIndex={-1}
            className={cn(CONTAINER, "flex flex-1 scroll-mt-14 flex-col gap-6 pt-6 pb-28 outline-none md:pt-8 lg:pb-10")}
          >
            {children}
          </main>

          <BarraInferiorPortal ocultos={ocultos} outrasAreas={outrasAreas} className="lg:hidden" />
        </div>
      </SidebarProvider>
    </ContadorAvisosProvider>
  )
}
