import type { Metadata } from "next"
import Link from "next/link"
import { CalendarClock, CheckCircle2, LogOut, Video, Vote } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { identidadeDaConta } from "@/lib/auth-identidade"
import { mascararEmail } from "@/lib/contas"
import {
  votacoesAbertas,
  vinculosDaSessao,
  type VinculoDaSessao,
  type VotacaoAberta,
} from "@/lib/db/votacao-link-unico"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { createClient } from "@/lib/supabase/server"

import { abrirCedulaLinkUnico, sairLinkUnico } from "./actions"
import { CadastroForm } from "./cadastro-form"
import { EntrarForm } from "./entrar-form"

export const metadata: Metadata = { title: "Votações — Confluir" }

/**
 * LINK ÚNICO DE VOTAÇÃO (07/10/2026): todas as votações online em andamento e
 * futuras da entidade, num endereço só. Quem não recebe o e-mail corporativo
 * confirma um e-mail que recebe e se identifica pelos dados — ver
 * lib/db/votacao-link-unico.ts.
 */
export default async function VotacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ cadastro?: string }>
}) {
  const busca = await searchParams
  const votacoes = await votacoesAbertas()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const identidade = user ? await identidadeDaConta(user.id) : null
  const cpf = identidade?.tipo === "filiado" ? identidade.cpf : null
  const vinculos = user
    ? await vinculosDaSessao({ email: user.email ?? null, cpf }, votacoes)
    : new Map<string, VinculoDaSessao>()
  const faltaVinculo = votacoes.some((v) => !v.somenteFiliados && !vinculos.has(v.assembleiaId))

  return (
    <main className="bg-muted/40 flex min-h-svh flex-col items-center gap-6 px-4 py-8">
      <Marca variante="completa" />
      <div className="grid w-full max-w-xl gap-4">
        <div className="grid gap-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Votações online</h1>
          <p className="text-muted-foreground text-sm text-balance">
            As votações abertas e as próximas. Para votar, confirme o seu e-mail e identifique-se uma vez.
          </p>
        </div>

        {busca.cadastro === "1" && (
          <Alert variant="success">
            <AlertDescription>
              Pronto! Encontramos você na lista de aptos. Escolha abaixo a votação e clique em Votar.
            </AlertDescription>
          </Alert>
        )}

        {!user ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Para votar</CardTitle>
              <CardDescription>Primeiro, confirme um e-mail que você recebe.</CardDescription>
            </CardHeader>
            <CardContent>
              <EntrarForm />
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="bg-background flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
              <span>
                Você entrou como <strong>{mascararEmail(user.email ?? "")}</strong>
              </span>
              <form action={sairLinkUnico}>
                <Button type="submit" variant="ghost" size="sm">
                  <LogOut />
                  Sair
                </Button>
              </form>
            </div>
            {votacoes.length > 0 && faltaVinculo && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {vinculos.size === 0 ? "Identifique-se" : "Falta alguma votação?"}
                  </CardTitle>
                  <CardDescription>
                    {vinculos.size === 0
                      ? "Informe os seus dados para encontrarmos o seu nome na lista de aptos."
                      : "Se você também é apto em outra votação da lista, confirme os seus dados de novo."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CadastroForm />
                </CardContent>
              </Card>
            )}
          </>
        )}

        <h2 className="mt-2 text-sm font-semibold">
          {votacoes.length === 0 ? "Nenhuma votação online aberta ou agendada" : "Votações"}
        </h2>
        {votacoes.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Quando houver uma votação online, ela aparece aqui. Fique de olho nos avisos do sindicato.
          </p>
        )}
        {votacoes.map((v) => (
          <CartaoVotacao key={v.assembleiaId} votacao={v} vinculo={vinculos.get(v.assembleiaId)} logado={Boolean(user)} />
        ))}
      </div>
      <p className="text-muted-foreground max-w-xl text-center text-xs text-balance">
        O voto é secreto: o sistema registra que você votou, nunca em quem votou. Ninguém do sindicato pede o seu
        código de acesso.
      </p>
    </main>
  )
}

function CartaoVotacao({
  votacao: v,
  vinculo,
  logado,
}: {
  votacao: VotacaoAberta
  vinculo: VinculoDaSessao | undefined
  logado: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle className="text-base">{v.nome ?? v.rodadaNome ?? "Votação"}</CardTitle>
            <CardDescription>
              {[v.empregador, v.tema, v.rodadaNome].filter(Boolean).join(" · ")}
            </CardDescription>
          </div>
          {v.situacao === "aberta" ? <Badge>Aberta</Badge> : <Badge variant="secondary">Em breve</Badge>}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="text-muted-foreground flex items-center gap-2">
          <CalendarClock className="size-4 shrink-0" />
          {v.situacao === "antes" && v.inicio
            ? `Abre em ${formatarDataHora(v.inicio)}`
            : v.termino
              ? `Aberta até ${formatarDataHora(v.termino)}`
              : "Aberta"}
        </p>
        {v.sala && (
          <p className="flex flex-wrap items-center gap-2">
            <Video className="text-muted-foreground size-4 shrink-0" />
            <span>
              Assembleia virtual
              {v.sala.data ? ` em ${formatarData(v.sala.data)}` : ""}
              {v.sala.hora ? ` às ${v.sala.hora}` : ""}
            </span>
            <a
              href={v.sala.link}
              target="_blank"
              rel="noreferrer"
              className="text-primary font-medium underline underline-offset-4"
            >
              Entrar na sala
            </a>
          </p>
        )}
        <Situacao votacao={v} vinculo={vinculo} logado={logado} />
      </CardContent>
    </Card>
  )
}

function Situacao({
  votacao: v,
  vinculo,
  logado,
}: {
  votacao: VotacaoAberta
  vinculo: VinculoDaSessao | undefined
  logado: boolean
}) {
  if (v.somenteFiliados) {
    return (
      <p className="text-muted-foreground">
        Votação só para filiados —{" "}
        <Link href="/portal/votacao" className="text-primary underline underline-offset-4">
          vote pela área do filiado
        </Link>
        .
      </p>
    )
  }
  if (!logado) return <p className="text-muted-foreground">Confirme o seu e-mail acima para votar.</p>
  if (!vinculo) return <p className="text-muted-foreground">Seu nome ainda não foi encontrado na lista desta votação.</p>
  if (vinculo.jaVotou) {
    return (
      <p className="text-success-fg flex items-center gap-2 font-medium">
        <CheckCircle2 className="size-4" />
        Você já votou. Obrigado por participar.
      </p>
    )
  }
  if (!vinculo.elegivel) return <p className="text-muted-foreground">Você não está habilitado a votar nesta votação.</p>
  if (v.situacao === "antes") return <p className="text-muted-foreground">Você está na lista. Volte quando a votação abrir.</p>
  return (
    <form action={abrirCedulaLinkUnico}>
      <input type="hidden" name="assembleia_id" value={v.assembleiaId} />
      <Button type="submit" className="w-full">
        <Vote />
        Votar
      </Button>
    </form>
  )
}
