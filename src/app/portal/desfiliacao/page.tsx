import type { Metadata } from "next"
import Link from "next/link"
import { CalendarClock, Info, Link2, MessageSquarePlus } from "lucide-react"

import { MOTIVO_DESFILIACAO } from "@/app/portal/primeiro-acesso/regras"
import { CopiarLinkBotao } from "@/components/copiar-link"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getSessaoPainel } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { oQueAcontece } from "@/lib/db/desistencia-coletiva"
import { emailContatoEntidade } from "@/lib/db/organizacao"
import { opcoesDaParte, rotasDesabilitadas, situacaoDoPortal } from "@/lib/db/portal-partes"
import { CONDICAO_COLETIVA, EM_ANDAMENTO_DESFILIACAO } from "@/lib/filiacao"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { opcoesPadrao } from "@/lib/portal-partes-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { desistirFiliacaoColetiva, linkDesistenciaAction } from "./actions"
import { DesistirForm } from "./desistir-form"

export const metadata: Metadata = { title: "Minha filiação" }

/**
 * Pedido de desfiliação pelo Atendimento, com assunto e resumo já preenchidos
 * (A26). A marca `motivo` deixa o pedido passar pelo primeiro acesso
 * pendente — é direito do associado (ver MOTIVO_DESFILIACAO).
 */
const ATENDIMENTO_DESFILIACAO = `/portal/atendimento?${new URLSearchParams({
  assunto: "cadastro",
  titulo: "Desfiliação",
  motivo: MOTIVO_DESFILIACAO,
})}`

/** Sem o botão do Atendimento e sem texto próprio da entidade. */
const ORIENTACAO_SEM_ATENDIMENTO =
  "A desfiliação é pedida à secretaria da entidade, que comunica a sua empresa para encerrar o desconto."

/**
 * Área do filiado — desistência da FILIAÇÃO COLETIVA. Só habilitada para quem
 * está na condição "Em processo de filiação coletiva" e dentro do prazo; para
 * os demais, o pedido de desfiliação vai pelo Atendimento.
 *
 * Na largura das demais páginas do portal (A160/A184): o estreitamento
 * próprio (max-w-2xl) dentro do contêiner da casca saiu.
 *
 * Área do associado: a parte não se suspende nem se desabilita (direito do
 * associado; a desistência tem prazo). A entidade escolhe o texto de como
 * pedir a desfiliação e se o botão do Atendimento aparece — sem ele (ou com o
 * Atendimento desabilitado), a página dá o contato da entidade: nunca fica
 * sem caminho.
 */
export default async function DesfiliacaoPortalPage() {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const admin = await createAdminClient()
  const [{ data }, opcoes, desligadas, email, situacao] = await Promise.all([
    admin
      .from("filiacoes")
      .select("filiacao_condicao, filiacao_coletiva_prazo")
      .eq("id", filiado.filiacaoId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    // Na dúvida, vale o de sempre (texto padrão e o botão).
    opcoesDaParte("desfiliacao").catch(() => opcoesPadrao("desfiliacao")),
    rotasDesabilitadas().catch(() => [] as string[]),
    emailContatoEntidade().catch(() => null),
    situacaoDoPortal().catch(() => null),
  ])
  // Portal fora do ar: esta página continua aberta, mas o Atendimento, O
  // sindicato, Meu cadastro e o Início levariam à página de manutenção — fica
  // o contato da entidade.
  const foraDoAr = situacao?.estado === "desabilitada"
  const pedidoOnline = opcoes.solicitacao_online && !foraDoAr && !desligadas.includes("/portal/atendimento")
  const comSindicato = !foraDoAr && !desligadas.includes("/portal/sindicato")
  // O texto padrão fala do Atendimento: sem o botão, só vale o rito próprio
  // da entidade (ou a frase sem o Atendimento).
  const padrao = opcoesPadrao("desfiliacao").texto_orientacao
  const ritoProprio = opcoes.texto_orientacao && opcoes.texto_orientacao !== padrao ? opcoes.texto_orientacao : null
  const orientacao = ritoProprio ?? (pedidoOnline ? padrao : ORIENTACAO_SEM_ATENDIMENTO)

  const condicao = (data?.filiacao_condicao as string | null) ?? null
  const prazo = (data?.filiacao_coletiva_prazo as string | null) ?? null
  const hoje = hojeSP()
  const emColetiva = condicao === CONDICAO_COLETIVA
  const dentroDoPrazo = emColetiva && (!prazo || prazo >= hoje)
  const emDesfiliacao = (EM_ANDAMENTO_DESFILIACAO as string[]).includes(condicao ?? "")

  // Na visualização, quem cuida da filiação copia daqui o link sem login
  // para mandar ao trabalhador (o lote coletivo não envia e-mail).
  let gestaoGeraLink = false
  if (preview && dentroDoPrazo) {
    const painel = await getSessaoPainel()
    gestaoGeraLink =
      !!painel && podeAcessar(painel.permissoes, "filiacao_gestao", ["assembleias"])
  }

  return (
    <>
      <CabecalhoPagina
        secao="/portal/desfiliacao"
        titulo="Minha filiação"
        subtitulo={
          <>
            Situação atual: <strong>{condicao ?? "—"}</strong>
          </>
        }
      />

      {dentroDoPrazo ? (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              <CalendarClock aria-hidden className="mr-1 inline size-4 align-[-3px]" />
              Você foi filiado por decisão da assembleia
            </CardTitle>
            <CardDescription>
              A categoria aprovou, em assembleia, um acordo coletivo com
              cláusula de filiação coletiva — por isso você consta como
              filiado.
              {prazo && (
                <>
                  {" "}
                  Se não quiser permanecer, você pode desistir até{" "}
                  <strong>{formatarData(prazo)}</strong>, aqui mesmo.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Alert>
              <Info />
              <AlertTitle>O que acontece se você desistir</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 grid list-disc gap-1 pl-5">
                  {oQueAcontece("portal").map((linha) => (
                    <li key={linha}>{linha}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
            <DesistirForm action={desistirFiliacaoColetiva} preview={preview} />
          </CardContent>
        </Card>
      ) : emDesfiliacao ? (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Seu pedido de desfiliação está em andamento
            </CardTitle>
            <CardDescription>
              A entidade comunica a sua empresa para encerrar o desconto. O
              desconto do mês em curso ainda pode aparecer no contracheque —
              é esperado: ele para quando a empresa processa o aviso.
            </CardDescription>
          </CardHeader>
          {!foraDoAr && (
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/portal/cadastro">Acompanhar em Meu cadastro</Link>
              </Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Pedir a desfiliação
            </CardTitle>
            <CardDescription className="whitespace-pre-line">
              {emColetiva && prazo
                ? `O prazo de desistência online da filiação coletiva terminou em ${formatarData(prazo)}. `
                : ""}
              {/* O rito da entidade (Área do associado › Minha filiação). */}
              {orientacao}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {/* Sem o botão (desligado ou sem Atendimento), o contato da
                entidade: a desfiliação nunca fica sem caminho. */}
            {!pedidoOnline && (
              <p className="text-muted-foreground text-sm">
                Dúvidas sobre como pedir? Fale com a secretaria
                {email ? (
                  <>
                    {" "}
                    pelo e-mail{" "}
                    <a href={`mailto:${email}`} className="text-foreground font-medium underline underline-offset-4">
                      {email}
                    </a>
                  </>
                ) : null}
                {comSindicato ? (
                  <>
                    {" "}
                    ou veja os canais em{" "}
                    <Link href="/portal/sindicato" className="text-foreground font-medium underline underline-offset-4">
                      O sindicato
                    </Link>
                  </>
                ) : null}
                .
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {pedidoOnline && (
                <Button asChild>
                  <Link href={ATENDIMENTO_DESFILIACAO}>
                    <MessageSquarePlus />
                    Abrir solicitação de desfiliação
                  </Link>
                </Button>
              )}
              {!foraDoAr && (
                <Button asChild variant="ghost">
                  <Link href="/portal/inicio">Voltar ao início</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {gestaoGeraLink && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              <Link2 aria-hidden className="mr-1 inline size-4 align-[-3px]" />
              Link de desistência sem login
            </CardTitle>
            <CardDescription>
              Só a gestão vê este quadro. O link abre uma página pública em
              que o trabalhador desiste sem entrar no portal; vale até o fim
              do prazo e não mostra nenhum outro dado do cadastro. Mande-o
              apenas para o próprio trabalhador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CopiarLinkBotao
              obterLink={linkDesistenciaAction}
              rotulo="Copiar link de desistência"
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
