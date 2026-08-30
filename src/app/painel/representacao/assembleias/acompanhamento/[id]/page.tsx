import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Users, Vote } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { acompanhamentoAssembleia } from "@/lib/db/votacao-mesarios"
import { formatarCpf } from "@/lib/cpf"
import { formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Acompanhamento — Confluir" }

const ROTULO_STATUS = {
  pendente: "Pendente",
  deferido: "Deferido",
  indeferido: "Indeferido",
} as const

export default async function AcompanhamentoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const dados = await acompanhamentoAssembleia(id)
  if (!dados) notFound()

  const participacao =
    dados.totalAptos > 0
      ? Math.round((dados.votaram / dados.totalAptos) * 100)
      : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/representacao/assembleias">
            <ArrowLeft />
            Assembleias
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Acompanhamento — {dados.nome ?? "assembleia"}
        </h1>
        <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 text-xs">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {dados.totalAptos.toLocaleString("pt-BR")} aptos
          </span>
          <span className="inline-flex items-center gap-1">
            <Vote className="size-3.5" />
            {dados.votaram.toLocaleString("pt-BR")} já votaram
            {participacao !== null && <> · {participacao}%</>}
          </span>
          <span>
            {dados.emSeparadoContagem.total.toLocaleString("pt-BR")} em separado
          </span>
        </p>
      </div>

      {/* Votos em separado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Votos em separado</CardTitle>
          <CardDescription>
            Eleitores fora da lista de aptos. A validação (deferir/indeferir)
            acontece na apuração.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">
              Total: {dados.emSeparadoContagem.total}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              Pendentes: {dados.emSeparadoContagem.pendente}
            </Badge>
            <Badge variant="outline" className="border-success/40 text-success-fg">
              Deferidos: {dados.emSeparadoContagem.deferido}
            </Badge>
            <Badge variant="outline" className="border-destructive/40">
              Indeferidos: {dados.emSeparadoContagem.indeferido}
            </Badge>
          </div>
          {dados.emSeparado.length === 0 ? (
            <p className="text-muted-foreground py-2 text-center text-sm">
              Nenhum voto em separado registrado.
            </p>
          ) : (
            <div className="grid gap-2">
              {dados.emSeparado.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{s.nome ?? "(sem nome)"}</p>
                    <p className="text-muted-foreground text-xs">
                      {s.cpf ? formatarCpf(s.cpf) : "sem CPF"}
                      {s.urna ? ` · ${s.urna}` : ""}
                      {s.telefone ? ` · ${s.telefone}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      s.status === "deferido"
                        ? "border-success/40 text-success-fg"
                        : s.status === "indeferido"
                          ? "border-destructive/40"
                          : "text-muted-foreground"
                    }
                  >
                    {ROTULO_STATUS[s.status]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Votos por urna + lacres por dia */}
      {(dados.votosPorUrna.length > 0 || dados.lacresPorDia.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {dados.votosPorUrna.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Votos por urna</CardTitle>
                <CardDescription>Comparecimento em cada urna.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {dados.votosPorUrna.map((u, i) => (
                  <div key={i} className="flex justify-between gap-2 text-sm">
                    <span>{u.urna ?? "Urna"}</span>
                    <span className="tabular-nums font-medium">
                      {u.compareceram.toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {dados.lacresPorDia.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lacres por dia</CardTitle>
                <CardDescription>
                  Lacres instalados/rompidos, por dia e urna.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {dados.lacresPorDia.map((d) => (
                  <div key={d.dia} className="grid gap-1">
                    <p className="text-xs font-medium">
                      {d.dia === "—"
                        ? "—"
                        : new Date(d.dia + "T00:00:00").toLocaleDateString("pt-BR")}
                    </p>
                    {d.itens.map((it, i) => (
                      <div
                        key={i}
                        className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs"
                      >
                        <Badge variant="outline">
                          {it.tipo === "boca" ? "Boca" : "Principal"}
                        </Badge>
                        <span className="font-mono">nº {it.numero ?? "—"}</span>
                        <span>{it.evento}</span>
                        {it.urna && <span>· {it.urna}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Quem já votou */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem já votou</CardTitle>
          <CardDescription>
            Registro de participação (comparecimento) — nunca o conteúdo do voto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dados.quemVotou.length === 0 ? (
            <p className="text-muted-foreground py-2 text-center text-sm">
              Ninguém votou ainda.
            </p>
          ) : (
            <div className="grid gap-2">
              {dados.quemVotou.map((q, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{q.nome ?? "(sem nome)"}</p>
                    <p className="text-muted-foreground text-xs">
                      {q.cpf ? formatarCpf(q.cpf) : "—"}
                      {q.urna ? ` · ${q.urna}` : ""}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {q.quando ? formatarDataHora(q.quando) : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
