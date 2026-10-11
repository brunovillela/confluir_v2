import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, LogOut } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { Marca } from "@/components/marca"
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
import { getSessaoTrabalhador } from "@/lib/auth"
import { sairDoPortal } from "@/lib/actions/sessao"
import { campanhasAbertas, minhaOposicao } from "@/lib/db/oposicao"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import {
  estadoPrazo,
  ROTULO_SITUACAO_OPOSITOR,
} from "@/lib/oposicao-constantes"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { AcessoNaoFiliado } from "./oposicao-portal-forms"

export const metadata: Metadata = {
  title: "Oposição à contribuição — Confluir",
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

export default async function OposicaoPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ desistiu?: string }>
}) {
  const [sessao, { desistiu }, vis] = await Promise.all([
    getSessaoTrabalhador(),
    searchParams,
    // "Ver como filiado": a visualização vem ANTES da sessão do trabalhador.
    // Quem atende costuma ser filiado também — sem esta precedência, a tela
    // mostraria a oposição DO ATENDENTE dentro da visualização de outra pessoa.
    getVisualizacaoPortal(),
  ])
  const preview = vis?.preview ? vis : null

  const conteudo = (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Oposição à contribuição assistencial
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Registre, se desejar, sua oposição a uma contribuição assistencial.
        </p>
      </div>

      {desistiu === "1" && (
        <Alert className="border-info/40 text-info-fg">
          <AlertDescription>
            Registramos que você optou por não se opor. Obrigado por assistir.
          </AlertDescription>
        </Alert>
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
              <CardTitle className="text-base">Acesso</CardTitle>
              <CardDescription>
                Qualquer trabalhador da fonte pagadora pode se opor. Identifique-se
                e receba um <strong>código por e-mail</strong>. Seu acesso é
                registrado para fins de auditoria.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcessoNaoFiliado />
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
  // onde voltar, então o "Sair" continua.
  const entidade = await nomeEntidade()
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Marca tenant={entidade} />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {sessao && (
            <form action={sairDoPortal}>
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
      </main>
    </div>
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
  const campanhas = await campanhasAbertas()
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
        <Card>
          <CardContent>
            <div className="text-muted-foreground grid gap-1 py-8 text-center text-sm">
              <p>Nenhuma campanha de oposição aberta no momento.</p>
              {/* Quem paga pode ler "oposição" como parar de pagar a
                  mensalidade (A125). */}
              {perfil === "filiado" && (
                <p>
                  A contribuição assistencial não tem relação com a sua
                  mensalidade de associado.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        itens.map(({ campanha, prazo, minha }) => (
          <Card key={campanha.id}>
            <CardHeader>
              <CardTitle className="text-base text-balance">
                {campanha.nome ?? "Contribuição assistencial"}
              </CardTitle>
              <CardDescription>
                {campanha.detalhe_desconto}
                <span className="mt-1 block">
                  Prazo {formatarData(campanha.prazo_inicio)} –{" "}
                  {formatarData(campanha.prazo_fim)}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* 'desistente' ("não quero me opor") não é oposição registrada:
                  no prazo, a pessoa ainda pode mudar de ideia (A14). */}
              {minha && minha.situacao !== "desistente" ? (
                <Alert className="border-success/40 text-success-fg">
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Sua oposição já foi registrada —{" "}
                      {ROTULO_SITUACAO_OPOSITOR[minha.situacao]}.
                    </span>
                    <AcaoVisualizacao
                      preview={preview}
                      nota="O comprovante abre na conta do trabalhador."
                    >
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/portal/oposicao/comprovante/${minha.id}`}>
                          Ver comprovante
                        </Link>
                      </Button>
                    </AcaoVisualizacao>
                  </AlertDescription>
                </Alert>
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
                      ? "O prazo para se opor ainda não começou."
                      : "O prazo para se opor já encerrou."}
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
