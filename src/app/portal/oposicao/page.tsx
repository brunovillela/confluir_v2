import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, LogOut } from "lucide-react"

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
  const sessao = await getSessaoTrabalhador()
  const { desistiu } = await searchParams
  const entidade = await nomeEntidade()

  return (
    <div className="mx-auto grid min-h-dvh max-w-2xl gap-6 px-4 py-8">
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
            Registramos que você optou por não prosseguir. Obrigado por assistir.
          </AlertDescription>
        </Alert>
      )}

      {!sessao ? (
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
    </div>
  )
}

async function ListaCampanhas({
  cpf,
  nome,
  perfil,
}: {
  cpf: string
  nome: string | null
  perfil: "filiado" | "nao_filiado"
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
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nenhuma campanha de oposição aberta no momento.
            </p>
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
              {minha ? (
                <Alert className="border-success/40 text-success-fg">
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Sua oposição já foi registrada —{" "}
                      {ROTULO_SITUACAO_OPOSITOR[minha.situacao]}.
                    </span>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/portal/oposicao/comprovante/${minha.id}`}>
                        Ver comprovante
                      </Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : prazo === "aberto" ? (
                <Button asChild>
                  <Link href={`/portal/oposicao/${campanha.id}`}>
                    Registrar oposição
                    <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <Alert variant="warning">
                  <AlertDescription>
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
