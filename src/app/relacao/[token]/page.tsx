import type { Metadata } from "next"
import { CheckCircle2, CircleAlert, Clock, FileCheck2, MinusCircle } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { dadosDoLink, type MesNoLink } from "@/lib/db/repasse-link"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { rotuloCompetencia } from "@/lib/repasse"
import { cn } from "@/lib/utils"

import { ConfirmarRecebimento, EnviarRelacao } from "./formularios"

export const metadata: Metadata = {
  title: "Relação de descontos — Confluir",
  robots: { index: false },
}

const SITUACAO: Record<MesNoLink["situacao"], { rotulo: string; classe: string; icone: typeof Clock }> = {
  lancada: { rotulo: "Recebida", classe: "text-success-fg", icone: CheckCircle2 },
  enviada: { rotulo: "Enviada, em conferência", classe: "text-info-fg", icone: FileCheck2 },
  sem_desconto: { rotulo: "Sem desconto", classe: "text-success-fg", icone: MinusCircle },
  sem_valores: { rotulo: "Sem valores a repassar", classe: "text-success-fg", icone: MinusCircle },
  pendente: { rotulo: "Pendente", classe: "text-muted-foreground", icone: Clock },
  atrasada: { rotulo: "Atrasada", classe: "text-destructive", icone: CircleAlert },
}

/**
 * Página do RH da fonte pagadora, aberta pelo link próprio da empresa (sem
 * login): enviar a relação de descontos do mês, ver a situação dos meses e
 * confirmar as inclusões e exclusões de desconto (lib/db/repasse-link.ts).
 */
export default async function RelacaoDescontosPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const dados = await dadosDoLink(token)

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <div className="flex justify-center">
        <Marca variante="completa" />
      </div>
      {!dados ? (
        <Alert variant="destructive">
          <AlertDescription>
            Link inválido ou desativado. Confira se abriu o endereço completo que o sindicato mandou, ou peça um novo.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="text-center">
            <p className="text-muted-foreground text-sm">{dados.entidade}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Relação de descontos</h1>
            <p className="mt-1 text-lg">{dados.empresa}</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enviar a relação do mês</CardTitle>
              <CardDescription>
                Mande aqui a relação dos descontos das contribuições ao sindicato, ou informe que não houve desconto no
                mês.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EnviarRelacao token={token} opcoes={dados.opcoes} mostrarTipo={dados.tipos.length > 1} />
            </CardContent>
          </Card>

          {dados.meses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Situação dos últimos meses</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {dados.meses.map((m) => {
                    const s = SITUACAO[m.situacao]
                    return (
                      <li key={`${m.tipo}-${m.competencia}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span>
                          <span className="font-medium tabular-nums">{rotuloCompetencia(m.competencia)}</span>
                          {dados.tipos.length > 1 && <span className="text-muted-foreground"> · {m.tipo}</span>}
                        </span>
                        <span className={cn("flex items-center gap-1.5", s.classe)}>
                          <s.icone className="size-4" />
                          {s.rotulo}
                          {(m.situacao === "pendente" || m.situacao === "atrasada") && (
                            <span className="text-muted-foreground"> · prazo {formatarData(m.prazo)}</span>
                          )}
                          {m.situacao === "enviada" && m.enviadoEm && (
                            <span className="text-muted-foreground"> · em {formatarData(m.enviadoEm)}</span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {dados.comunicacoes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inclusões e exclusões de desconto</CardTitle>
                <CardDescription>
                  Trabalhadores que passam a ter (incluir) ou deixam de ter (excluir) o desconto da contribuição associativa
                  em folha, a partir da data indicada. Confirme o recebimento de cada envio.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                {dados.comunicacoes.map((c) => (
                  <div key={c.id} className="grid gap-3 rounded-lg border p-3">
                    <p className="text-sm font-medium">Envio de {formatarData(c.enviadoEm)}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-muted-foreground border-b text-left text-xs">
                            <th className="py-1.5 font-medium">Ação</th>
                            <th className="py-1.5 font-medium">Nome</th>
                            <th className="py-1.5 font-medium">Matrícula</th>
                            <th className="py-1.5 font-medium">CPF</th>
                            <th className="py-1.5 font-medium">A partir de</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.itens.map((i, n) => (
                            <tr key={n} className="border-b last:border-0">
                              <td className={cn("py-1.5 font-medium", i.acao === "inclusao" ? "text-success-fg" : "text-destructive")}>
                                {i.acao === "inclusao" ? "Incluir" : "Excluir"}
                              </td>
                              <td className="py-1.5">{i.nome}</td>
                              <td className="py-1.5">{i.matricula ?? "—"}</td>
                              <td className="py-1.5 tabular-nums">{i.cpf ?? "—"}</td>
                              <td className="py-1.5 tabular-nums">{i.data ? formatarData(i.data) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {c.confirmacao ? (
                      <p className="text-success-fg flex items-center gap-1.5 text-sm">
                        <CheckCircle2 className="size-4" />
                        Recebimento confirmado por {c.confirmacao.por} em {formatarDataHora(c.confirmacao.em)}.
                      </p>
                    ) : (
                      <ConfirmarRecebimento token={token} comunicacaoId={c.id} />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <p className="text-muted-foreground text-center text-xs">
            Este endereço é próprio da {dados.empresa}: guarde-o para os próximos meses e não o compartilhe fora do RH.
            {dados.emailEntidade && (
              <>
                {" "}
                Dúvidas: <a href={`mailto:${dados.emailEntidade}`} className="underline">{dados.emailEntidade}</a>.
              </>
            )}
          </p>
        </>
      )}
    </main>
  )
}
