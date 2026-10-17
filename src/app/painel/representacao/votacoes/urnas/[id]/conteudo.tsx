import { FileText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatarCpf } from "@/lib/cpf"
import type { Acompanhamento, dadosUrnasAssembleia } from "@/lib/db/votacao-mesarios"

import { UrnasEMesarios } from "./urnas-mesarios"

const ROTULO_STATUS = { pendente: "Pendente", deferido: "Deferido", indeferido: "Indeferido" } as const

/**
 * Aba "Urnas e mesários" da página da assembleia (reorganização de
 * 17/10/2026): urnas, mesários e apuradores, mais o que era o "Acompanhar" —
 * votos por urna, lacres por dia e os votos em separado. As rotas antigas
 * /urnas/<id> e /acompanhamento/<id> redirecionam para cá.
 */
export function ConteudoUrnas({
  dados,
  acomp,
  hrefApuracao,
}: {
  dados: NonNullable<Awaited<ReturnType<typeof dadosUrnasAssembleia>>>
  acomp: Acompanhamento | null
  /** A decisão dos votos em separado fica na aba Apuração. */
  hrefApuracao: string
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-3xl text-sm">
          O mesário registra a <strong>presença</strong> do eleitor — nunca o voto. Na urna digital, a presença libera a
          cédula num terminal de votação pareado, onde o próprio eleitor vota (secreto). O mesário usa{" "}
          <code>/mesario</code>; o terminal, <code>/urna</code>.
        </p>
        <Button variant="outline" size="sm" asChild>
          <a href={`/painel/representacao/votacoes/cedula/${dados.assembleiaId}`} target="_blank" rel="noopener noreferrer">
            <FileText />
            Baixar cédula (PDF)
          </a>
        </Button>
      </div>

      {acomp && (acomp.votosPorUrna.length > 0 || acomp.lacresPorDia.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {acomp.votosPorUrna.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Votos por urna</CardTitle>
                <CardDescription>Comparecimento em cada urna.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {acomp.votosPorUrna.map((u, i) => (
                  <div key={i} className="flex justify-between gap-2 text-sm">
                    <span>{u.urna ?? "Urna"}</span>
                    <span className="font-medium tabular-nums">{u.compareceram.toLocaleString("pt-BR")}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {acomp.lacresPorDia.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lacres por dia</CardTitle>
                <CardDescription>Lacres instalados/rompidos, por dia e urna.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {acomp.lacresPorDia.map((d) => (
                  <div key={d.dia} className="grid gap-1">
                    <p className="text-xs font-medium">
                      {d.dia === "—" ? "—" : new Date(d.dia + "T00:00:00").toLocaleDateString("pt-BR")}
                    </p>
                    {d.itens.map((it, i) => (
                      <div key={i} className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline">{it.tipo === "boca" ? "Boca" : "Principal"}</Badge>
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

      {acomp && acomp.emSeparado.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Votos em separado ({acomp.emSeparado.length})</CardTitle>
            <CardDescription>
              Eleitores fora da lista de aptos. A decisão (deferir/indeferir) fica na aba{" "}
              <a href={hrefApuracao} className="text-primary underline underline-offset-4">
                Apuração
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {acomp.emSeparado.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
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
          </CardContent>
        </Card>
      )}

      <Alert>
        <AlertDescription>O acesso à urna respeita o horário definido em cada urna abaixo.</AlertDescription>
      </Alert>

      <UrnasEMesarios
        assembleiaId={dados.assembleiaId}
        rodadaId={dados.rodadaId}
        urnas={dados.urnas}
        mesarios={dados.mesarios}
        apuradores={dados.apuradores}
      />
    </>
  )
}
