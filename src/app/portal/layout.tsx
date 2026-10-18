import type { Metadata } from "next"
import Link from "next/link"
import { cookies } from "next/headers"
import { CirclePause, Eye } from "lucide-react"

import { resumoDoPrimeiroAcesso } from "@/app/portal/primeiro-acesso/regras"
import { BarraInferiorPortal } from "@/components/portal/barra-inferior-portal"
import { CabecalhoPortal } from "@/components/portal/cabecalho-portal"
import { ContadorAvisosProvider } from "@/components/portal/contador-avisos"
import { HREF_AREA_DO_ASSOCIADO } from "@/components/portal/guarda-parte"
import { GuardaPrimeiroAcesso } from "@/components/portal/guarda-primeiro-acesso"
import { ManutencaoPortal } from "@/components/portal/manutencao-portal"
import { ABERTOS_COM_PORTAL_FORA_DO_AR } from "@/components/portal/navegacao-portal"
import { CabecalhoForaDoAr, PortalForaDoAr } from "@/components/portal/portal-fora-do-ar"
import { PortalSidebar } from "@/components/portal/portal-sidebar"
import { PularParaConteudo } from "@/components/portal/pular-para-conteudo"
import { RotasDesabilitadasProvider } from "@/components/portal/rotas-desabilitadas"
import { RegistrarSw } from "@/components/pwa/registrar-sw"
import { Button } from "@/components/ui/button"
import { SidebarProvider } from "@/components/ui/sidebar"
import { encerrarVisualizacaoFiliado } from "@/lib/actions/visualizacao"
import { mapaAjudaPortal } from "@/lib/ajuda/mapa-portal"
import { areasDaConta } from "@/lib/auth"
import { nomeEntidade } from "@/lib/db/organizacao"
import { contarAvisosNaoLidos } from "@/lib/db/portal-avisos"
import { opcoesDaParte, partesDesabilitadas, situacaoDoPortal, type SituacaoParte } from "@/lib/db/portal-partes"
import { pendenciasDoPrimeiroAcesso } from "@/lib/db/portal-primeiro-acesso"
import { canaisDoSindicato, secoesOcultasDoPortal } from "@/lib/db/sindicato-portal"
import { mensagemDaSituacao, opcoesPadrao, rotaDoMenu, type ChaveParte } from "@/lib/portal-partes-constantes"
import { cn } from "@/lib/utils"
import { getVisualizacaoPortal, type VisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Manifest do PWA do portal no lugar do herdado do RootLayout (que é o do
 * painel): quem instala o app por aqui abre em /portal/inicio, não no login
 * dos funcionários (A56). O manifest mora fora de /portal — ver
 * src/app/manifest-portal.webmanifest/route.ts.
 *
 * Título da aba com um sufixo só (A183): cada página exporta só o nome dela
 * ("Início", "Carteirinha"…) e o modelo completa. O modelo vale para as
 * páginas ABAIXO deste segmento — a tela de entrada (/portal/page.tsx, no
 * mesmo segmento) escreve o título inteiro.
 */
export const metadata: Metadata = {
  manifest: "/manifest-portal.webmanifest",
  title: { template: "%s — Portal do Associado", default: "Portal do Associado" },
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
 * Portal inteiro (Filiados › Área do associado): suspenso, uma faixa fixa no
 * topo da coluna do conteúdo — modo de consulta, as ações recusam no servidor
 * (bloqueioDaParte); desabilitado, uma casca mínima (entidade, tema e Sair)
 * com a página de manutenção no lugar do conteúdo, menos nas rotas que
 * continuam abertas (ver PortalForaDoAr). As partes desabilitadas saem do
 * menu, da barra, do "?" e da tela de erro por aqui; a rota de cada uma
 * mostra "indisponível" pelo GuardaParte da seção.
 *
 * Primeiro acesso pendente (termo de privacidade a aceitar ou dados
 * obrigatórios em branco): o convite para concluí-lo no lugar do conteúdo,
 * menos nas rotas que continuam abertas (ver GuardaPrimeiroAcesso). O portal
 * fora do ar tem precedência — e suspenso ou fora do ar não pede nada.
 *
 * O layout NÃO re-renderiza ao navegar entre as páginas do portal: as
 * consultas abaixo rodam uma vez por carregamento (entrada, recarga ou envio
 * de formulário que redireciona), e cada uma tem saída segura — na dúvida, o
 * item do menu aparece e a parte vale. O selo de não lidos acompanha a página
 * de avisos pelo ContadorAvisosProvider (ver contador-avisos.tsx).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const vis = await getVisualizacaoPortal()
  if (!vis) return children

  const preview = vis.preview ? vis : null
  const cpf = vis.filiado.cpf

  const [entidade, outrasAreas, naoLidos, ocultosDaPessoa, jar, portal, desabilitadas, atalhos, primeiroAcesso] = await Promise.all([
    nomeEntidade(),
    // O alternador de interfaces é da conta logada: na visualização seria o da gestão.
    preview
      ? Promise.resolve([])
      : areasDaConta()
          .then((a) => a.filter((x) => x.href !== "/portal/inicio"))
          .catch(() => []),
    contarAvisosNaoLidos(cpf).catch(() => 0),
    // O que sai do menu: Contribuição assistencial para quem não tem a ver com
    // ela (A125); Hospedagem sem hotel que aceite pedido e Convênios sem
    // convênio vigente (A57); as partes desabilitadas. A MESMA regra da grade
    // do Início — as duas nunca divergem.
    secoesOcultasDoPortal(cpf).catch(() => []),
    cookies(),
    // Filiados › Área do associado. Na dúvida (leitura que falhou), o portal
    // fica como sempre foi: habilitado, nada desabilitado, os atalhos padrão.
    situacaoDoPortal().catch(() => null),
    partesDesabilitadas().catch(() => [] as ChaveParte[]),
    opcoesDaParte("portal")
      .then((o) => o.atalhos)
      .catch(() => opcoesPadrao("portal").atalhos),
    // Primeiro acesso: o da pessoa vista (no "Ver como filiado", o portão
    // dela). Nunca rejeita — na dúvida, nada pendente.
    pendenciasDoPrimeiroAcesso(cpf, vis.filiado.filiacaoId),
  ])
  const rotasDesabilitadas = desabilitadas.map(rotaDoMenu).filter((r): r is string => r !== null)
  // As partes desabilitadas saem mesmo se a consulta acima tiver falhado.
  const ocultos = [...new Set([...ocultosDaPessoa, ...rotasDesabilitadas])]

  if (portal?.estado === "desabilitada") {
    const canais = await canaisDoSindicato().catch(() => null)
    return (
      <div className="bg-background flex min-h-svh w-full flex-col">
        <PularParaConteudo />
        {preview && <FaixaVisualizacao preview={preview} />}
        <CabecalhoForaDoAr entidade={entidade} preview={Boolean(preview)} />
        <main
          id="conteudo"
          tabIndex={-1}
          className={cn(CONTAINER, "flex flex-1 scroll-mt-14 flex-col gap-6 py-6 outline-none md:py-8")}
        >
          <PortalForaDoAr
            manutencao={
              <ManutencaoPortal
                mensagem={mensagemDaSituacao("portal", portal)}
                canais={canais}
                abertos={ABERTOS_COM_PORTAL_FORA_DO_AR.filter((a) => !ocultos.includes(a.href))}
                preview={Boolean(preview)}
              />
            }
          >
            {children}
          </PortalForaDoAr>
        </main>
      </div>
    )
  }

  const lateralAberta = jar.get(COOKIE_LATERAL)?.value !== "false"

  return (
    <ContadorAvisosProvider naoLidos={naoLidos}>
      <RotasDesabilitadasProvider rotas={rotasDesabilitadas}>
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
            {preview && <FaixaVisualizacao preview={preview} />}
            {portal?.estado === "suspensa" && <FaixaModoConsulta portal={portal} preview={Boolean(preview)} />}

            <CabecalhoPortal
              entidade={entidade}
              preview={Boolean(preview)}
              mapaAjuda={mapaAjudaPortal(desabilitadas)}
            />

            {/* Abaixo de lg a barra inferior fixa cobre o fim da página: a folga
                é a altura dela (3,5rem) mais a área segura do aparelho — a mesma
                conta que a barra faz — e 2rem de respiro (A175).
                scroll-mt-14: ao receber o foco do "Pular para o conteúdo" com a
                página rolada, o topo não fica sob o cabeçalho sticky (h-14). */}
            <main
              id="conteudo"
              tabIndex={-1}
              className={cn(
                CONTAINER,
                "flex flex-1 scroll-mt-14 flex-col gap-6 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none md:pt-8 lg:pb-10"
              )}
            >
              <GuardaPrimeiroAcesso
                resumo={primeiroAcesso.pendente ? resumoDoPrimeiroAcesso(primeiroAcesso) : null}
                hrefGestao={preview ? `${HREF_AREA_DO_ASSOCIADO}#parte-primeiro_acesso` : null}
              >
                {children}
              </GuardaPrimeiroAcesso>
            </main>

            <BarraInferiorPortal ocultos={ocultos} atalhos={atalhos} outrasAreas={outrasAreas} className="lg:hidden" />
          </div>
        </SidebarProvider>
      </RotasDesabilitadasProvider>
    </ContadorAvisosProvider>
  )
}

/** "Ver como filiado": quem está sendo visto, quem vê e a saída. */
function FaixaVisualizacao({ preview }: { preview: VisualizacaoPortal }) {
  return (
    <div className="border-warning/40 bg-warning/10 text-warning-fg border-b print:hidden">
      <div className={cn(CONTAINER, "flex flex-wrap items-center justify-between gap-2 py-2 text-sm")}>
        <span className="flex items-center gap-2">
          <Eye className="size-4 shrink-0" aria-hidden />
          <span>
            Visualizando a área de <strong>{preview.filiado.nome_completo ?? "filiado"}</strong> — somente leitura
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
  )
}

/**
 * Portal inteiro suspenso: modo de consulta. Faixa fixa no topo da coluna do
 * conteúdo, no mesmo lugar e família da faixa da visualização. Com mensagem
 * própria da gestão, a frase do modo de consulta vem antes dela — o
 * associado precisa saber que nada será enviado. A gestão vê onde mudar.
 */
function FaixaModoConsulta({ portal, preview }: { portal: SituacaoParte; preview: boolean }) {
  return (
    <div className="border-warning/40 bg-warning/10 text-warning-fg border-b print:hidden">
      <div className={cn(CONTAINER, "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm")}>
        <p className="flex min-w-0 items-start gap-2">
          <CirclePause className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {portal.mensagem && (
              <strong className="font-semibold">
                Portal em modo de consulta: dá para ver tudo, mas nada pode ser enviado agora.{" "}
              </strong>
            )}
            {mensagemDaSituacao("portal", portal)}
          </span>
        </p>
        {preview && (
          <Link
            href={`${HREF_AREA_DO_ASSOCIADO}#parte-portal`}
            className="text-xs underline underline-offset-2 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
          >
            Só a gestão vê: mudar em Filiados › Área do associado
          </Link>
        )}
      </div>
    </div>
  )
}
