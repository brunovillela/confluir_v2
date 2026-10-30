import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, CheckCircle2, CircleHelp, Clock, FileWarning, LogOut, ScrollText, XCircle } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { Marca } from "@/components/marca"
import { AvisoDaUrl } from "@/components/portal/aviso-da-url"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { ThemeToggle } from "@/components/theme-toggle"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { destinoDaOposicao, getSessaoTrabalhador } from "@/lib/auth"
import { mensagemLinkRecusado } from "@/lib/auth-email-constantes"
import { hojeSP } from "@/lib/db/comum"
import { campanhasDoTrabalhador, minhaOposicao, type MinhaOposicao } from "@/lib/db/oposicao"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import { estadoPrazo } from "@/lib/oposicao-constantes"
import { perguntasDeAcesso } from "@/lib/oposicao-orientacoes"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { sairDaOposicao } from "./actions"
import { AcessoNaoFiliado } from "./oposicao-portal-forms"
import { PerguntasFrequentes } from "./orientacoes"
import { PrazoOposicao } from "./prazo-oposicao"
import { fraseResultado, VARIANTE_SITUACAO_PORTAL } from "./situacao-portal"
import { AvisoPrivacidade } from "@/components/aviso-privacidade"

export const metadata: Metadata = { title: "Oposição à contribuição assistencial" }

export default async function OposicaoPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ desistiu?: string; erro?: string; voltar?: string }>
}) {
  const [sessao, { desistiu, erro, voltar }, vis] = await Promise.all([
    getSessaoTrabalhador(),
    searchParams,
    // "Ver como filiado": a visualização vem ANTES da sessão do trabalhador.
    // Quem atende costuma ser filiado também — sem esta precedência, a tela
    // mostraria a oposição DO ATENDENTE dentro da visualização de outra pessoa.
    getVisualizacaoPortal(),
  ])
  const preview = vis?.preview ? vis : null
  // Já com sessão e vindo de um link (comprovante): vai direto (M7).
  const destino = voltar ? destinoDaOposicao(voltar) : null
  if (sessao && !preview && destino && destino !== "/portal/oposicao") redirect(destino)
  // Link de e-mail antigo recusado em /auth/confirm volta para cá (A3).
  const erroLink = sessao ? undefined : mensagemLinkRecusado(erro, "portal")

  // A tela de acesso traz as perguntas da entrada (código, filiado ou não).
  const perguntasEntrada = !sessao && !preview ? perguntasDeAcesso(await nomeEntidade()) : []
  const conteudo = (
    <>
      <CabecalhoPagina
        secao="/portal/oposicao"
        titulo="Oposição à contribuição assistencial"
        subtitulo="Registre, se desejar, sua oposição a uma contribuição assistencial."
        acoes={
          // A ajuda do portal é só de quem está nele (A106).
          vis && (
            <Button variant="link" asChild className="px-0">
              <Link href="/portal/ajuda/oposicao">
                <CircleHelp />
                Como funciona
              </Link>
            </Button>
          )
        }
      />

      {erroLink && (
        <AvisoDaUrl parametros={["erro"]}>
          <Alert variant="destructive">
            <AlertDescription>{erroLink}</AlertDescription>
          </Alert>
        </AvisoDaUrl>
      )}

      {desistiu === "1" && (
        <AvisoDaUrl parametros={["desistiu"]}>
          <Alert variant="info">
            <AlertDescription>
              Registramos que você optou por não se opor. Se mudar de ideia, dá
              para registrar a oposição enquanto o prazo da campanha estiver
              aberto.
            </AlertDescription>
          </Alert>
        </AvisoDaUrl>
      )}

      {preview ? (
        <>
          <Alert variant="warning">
            <AlertDescription>
              Visualizando a oposição de{" "}
              <strong>{preview.filiado.nome_completo ?? "filiado"}</strong> —
              somente leitura. Registrar oposição e abrir o comprovante são atos
              do próprio trabalhador, na conta dele.
            </AlertDescription>
          </Alert>
          <ListaCampanhas
            cpf={preview.filiado.cpf}
            nome={preview.filiado.nome_completo}
            perfil="filiado"
            preview
          />
        </>
      ) : !sessao ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Acesso
              </CardTitle>
              <CardDescription>
                Qualquer trabalhador da fonte pagadora pode se opor. Identifique-se
                e receba um <strong>código por e-mail</strong>. Seu acesso fica
                registrado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcessoNaoFiliado voltar={destino && destino !== "/portal/oposicao" ? destino : undefined} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Como funciona
              </CardTitle>
              <CardDescription>
                1. Escolha <strong>Sou filiado</strong> (o código vai para os e-mails do seu cadastro) ou{" "}
                <strong>Não sou filiado</strong> (informe nome, CPF e um e-mail seu). 2. Digite o código que chegou
                no e-mail. 3. Abra a campanha, leia as instruções e siga os passos até o comprovante.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PerguntasFrequentes itens={perguntasEntrada} />
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-center text-sm">
            Filiado com acesso ao portal? Você também pode entrar pelo{" "}
            <Link href="/portal" className="text-primary underline">
              Portal do Associado
            </Link>
            .
          </p>
        </>
      ) : (
        <ListaCampanhas cpf={sessao.cpf} nome={sessao.nome} perfil={sessao.perfil} />
      )}
    </>
  )

  // Na casca do portal (a mesma regra do layout: filiado logado ou gestão em
  // "Ver como filiado"), só a coluna de leitura — menu, cabeçalho, sino e o
  // <main> são do layout, e o "Sair" que derrubava a sessão do filiado sai
  // daqui (A17, A125).
  if (vis) {
    return <div className="mx-auto grid w-full max-w-2xl gap-6">{conteudo}</div>
  }

  // Fora dela, o trabalhador não filiado: tela enxuta com a sessão própria da
  // Oposição, agora com o <main> como landmark (A181). Aqui não há portal para
  // onde voltar, então o "Sair" continua — e volta a esta entrada.
  const entidade = await nomeEntidade()
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Marca tenant={entidade} />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {sessao && (
            <form action={sairDaOposicao}>
              <Button variant="ghost" size="sm" type="submit">
                <LogOut />
                Sair
              </Button>
            </form>
          )}
        </div>
      </header>
      <main id="conteudo" className="grid gap-6">
        {conteudo}
        <AvisoPrivacidade />
      </main>
    </div>
  )
}

const ICONE_SITUACAO = {
  aguardando_documento: FileWarning,
  nao_avaliada: Clock,
  aprovada: CheckCircle2,
  reprovada: XCircle,
} as const

/**
 * O resultado no cartão da campanha (A15): a mesma frase curta do
 * comprovante, com a cor e o ícone da situação. O motivo de uma oposição não
 * aceita fica no comprovante — que só o próprio trabalhador abre.
 */
function ResultadoNaLista({
  minha,
  prazoFim,
  preview,
}: {
  minha: MinhaOposicao
  prazoFim: string | null
  preview: boolean
}) {
  const situacao = minha.situacao === "desistente" ? "nao_avaliada" : minha.situacao
  const Icone = ICONE_SITUACAO[situacao]
  const variante = VARIANTE_SITUACAO_PORTAL[situacao]
  const falta = situacao === "aguardando_documento"
  return (
    <Alert variant={variante === "secondary" ? "default" : variante}>
      <Icone />
      <AlertDescription>
        {fraseResultado(situacao, {
          avaliadaEm: minha.avaliadaEm,
          registradaEm: minha.dia,
          prazoFim,
        })}
        {situacao === "reprovada" && " O motivo está no comprovante."}
      </AlertDescription>
      {/* Fora do AlertDescription, que sublinha todo <a> dentro dele. */}
      <div className="col-start-2 mt-2">
        <AcaoVisualizacao
          preview={preview}
          nota="O comprovante abre na conta do trabalhador."
        >
          <Button variant={falta ? "default" : "outline"} asChild>
            <Link href={`/portal/oposicao/comprovante/${minha.id}`}>
              {falta ? "Enviar a carta" : "Ver comprovante"}
            </Link>
          </Button>
        </AcaoVisualizacao>
      </div>
    </Alert>
  )
}

async function ListaCampanhas({
  cpf,
  nome,
  perfil,
  preview = false,
}: {
  cpf: string
  nome: string | null
  perfil: "filiado" | "nao_filiado"
  /** Visualização da gestão: mostra a situação, não deixa agir. */
  preview?: boolean
}) {
  const campanhas = await campanhasDoTrabalhador(cpf)
  const hoje = hojeSP()

  const itens = await Promise.all(
    campanhas.map(async (c) => ({
      campanha: c,
      prazo: estadoPrazo(c.prazo_inicio, c.prazo_fim, hoje),
      minha: await minhaOposicao(c.id, cpf),
    }))
  )

  return (
    <div className="grid gap-4">
      <p className="text-sm">
        Olá, <strong>{nome ?? "trabalhador(a)"}</strong> ·{" "}
        <Badge variant="secondary">
          {perfil === "filiado" ? "Filiado" : "Não filiado"}
        </Badge>
      </p>

      {itens.length === 0 ? (
        <EstadoVazio
          cartao
          icone={ScrollText}
          titulo="Nenhuma campanha de oposição aberta no momento."
          // Quem paga pode ler "oposição" como parar de pagar a mensalidade (A125).
          descricao={
            perfil === "filiado"
              ? "A contribuição assistencial não tem relação com a sua mensalidade de associado."
              : undefined
          }
        />
      ) : (
        itens.map(({ campanha, prazo, minha }) => (
          <Card key={campanha.id}>
            <CardHeader>
              <CardTitle role="heading" aria-level={2} className="text-balance">
                {campanha.nome ?? "Contribuição assistencial"}
              </CardTitle>
              <CardDescription className="grid gap-2">
                {campanha.detalhe_desconto && <span>{campanha.detalhe_desconto}</span>}
                {/* Quanto falta, com destaque perto do fim (A106). Depois de
                    registrada, o que importa é o resultado — o prazo sai. */}
                {(!minha || minha.situacao === "desistente" || minha.situacao === "aguardando_documento") && (
                  <span className="flex flex-wrap items-center gap-2">
                    <span>
                      Prazo: {formatarData(campanha.prazo_inicio)} a{" "}
                      {formatarData(campanha.prazo_fim)}
                    </span>
                    <PrazoOposicao inicio={campanha.prazo_inicio} fim={campanha.prazo_fim} hoje={hoje} />
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* 'desistente' ("não quero me opor") não é oposição registrada:
                  no prazo, a pessoa ainda pode mudar de ideia (A14). */}
              {minha && minha.situacao !== "desistente" ? (
                // "Falta enviar a carta até dd/mm" só com o prazo aberto: depois
                // dele, o selo do prazo já diz que encerrou.
                <ResultadoNaLista
                  minha={minha}
                  prazoFim={prazo === "aberto" ? campanha.prazo_fim : null}
                  preview={preview}
                />
              ) : prazo === "aberto" ? (
                <div className="grid gap-3">
                  {minha && (
                    <Alert variant="info">
                      <AlertDescription>
                        Você optou por não se opor
                        {minha.dia ? ` em ${formatarData(minha.dia)}` : ""}. O
                        prazo segue aberto até {formatarData(campanha.prazo_fim)}{" "}
                        — você pode mudar de ideia.
                      </AlertDescription>
                    </Alert>
                  )}
                  <AcaoVisualizacao
                    preview={preview}
                    nota="Só o próprio trabalhador registra a oposição dele."
                  >
                    <Button asChild>
                      <Link href={`/portal/oposicao/${campanha.id}`}>
                        Registrar oposição
                        <ArrowRight />
                      </Link>
                    </Button>
                  </AcaoVisualizacao>
                </div>
              ) : (
                <Alert variant="warning">
                  <AlertDescription>
                    {minha &&
                      `Você optou por não se opor${
                        minha.dia ? ` em ${formatarData(minha.dia)}` : ""
                      }. `}
                    {prazo === "antes"
                      ? `O prazo para se opor começa em ${formatarData(campanha.prazo_inicio)}.`
                      : prazo === "depois"
                        ? `O prazo para se opor terminou em ${formatarData(campanha.prazo_fim)}.`
                        : "Esta campanha está sem prazo definido. Fale com a entidade."}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
