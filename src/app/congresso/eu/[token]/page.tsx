import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CalendarDays, CheckCircle2, Clock, MapPin, XCircle } from "lucide-react"

import { AvisoPrivacidade } from "@/components/aviso-privacidade"
import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { minhaInscricao } from "@/lib/db/congressos-inscricao"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { tenantAtual } from "@/lib/tenant"

export const metadata: Metadata = {
  title: "Minha participação — Confluir",
  robots: { index: false },
  referrer: "no-referrer",
}

const SITUACAO: Record<string, { texto: string; icone: React.ReactNode; cor: string }> = {
  confirmado: { texto: "Inscrição confirmada", icone: <CheckCircle2 className="size-5" />, cor: "text-emerald-700 dark:text-emerald-400" },
  inscrito: { texto: "Inscrição recebida, aguardando a comissão organizadora", icone: <Clock className="size-5" />, cor: "text-amber-700 dark:text-amber-400" },
  lista_espera: { texto: "Na lista de espera", icone: <Clock className="size-5" />, cor: "text-amber-700 dark:text-amber-400" },
  recusado: { texto: "Inscrição não aceita", icone: <XCircle className="size-5" />, cor: "text-destructive" },
  cancelado: { texto: "Inscrição cancelada", icone: <XCircle className="size-5" />, cor: "text-destructive" },
}

export default async function MinhaParticipacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ nova?: string }>
}) {
  const { token } = await params
  const { nova } = await searchParams
  const tenantId = await tenantAtual()
  const [m, org] = await Promise.all([minhaInscricao(token, tenantId), obterOrganizacao()])
  if (!m) notFound()
  const s = SITUACAO[m.situacao] ?? SITUACAO.inscrito
  const entidade = org?.nomeFantasia ?? org?.nomeRazao ?? null

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <div className="flex flex-col items-center text-center">
        <Marca variante="completa" />
        {entidade && <p className="text-muted-foreground mt-3 text-xs uppercase tracking-wide">{entidade}</p>}
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {m.congresso.edicao ? `${m.congresso.edicao}º ` : ""}
          {m.congresso.nome}
        </h1>
        <div className="text-muted-foreground mt-2 grid gap-1 text-sm">
          {m.congresso.inicio && (
            <p className="flex items-center justify-center gap-2">
              <CalendarDays className="size-4" />
              {formatarData(m.congresso.inicio)}
              {m.congresso.termino && formatarData(m.congresso.termino) !== formatarData(m.congresso.inicio)
                ? ` a ${formatarData(m.congresso.termino)}`
                : ""}
            </p>
          )}
          {m.congresso.local && (
            <p className="flex items-center justify-center gap-2">
              <MapPin className="size-4" />
              {m.congresso.local}
            </p>
          )}
        </div>
      </div>

      {nova && (
        <Alert>
          <AlertDescription>
            Inscrição registrada. <strong>Guarde este endereço</strong> (favorito ou print): é o seu link pessoal. Também
            enviamos para o seu e-mail. Não repasse: ele identifica você no congresso.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{m.nome}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className={`flex items-center gap-2 font-medium ${s.cor}`}>
            {s.icone}
            {s.texto}
            {m.situacao === "lista_espera" && m.posicaoEspera ? ` (posição ${m.posicaoEspera})` : ""}
          </p>
          {m.papel && (
            <p>
              <span className="text-muted-foreground">Participa como:</span> {m.papel}
              {m.unidade ? ` · ${m.unidade}` : ""}
              {m.grupo ? ` · ${m.grupo}` : ""}
            </p>
          )}
          {m.resumo && <p className="text-muted-foreground">{m.resumo}</p>}
        </CardContent>
      </Card>

      {m.sessoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Programa</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {m.sessoes.map((x, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-muted-foreground w-32 shrink-0 tabular-nums">{x.inicio ? formatarDataHora(x.inicio) : "—"}</span>
                  <span>
                    {x.titulo}
                    {x.local && <span className="text-muted-foreground"> · {x.local}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <AvisoPrivacidade />
    </main>
  )
}
