import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CheckCircle2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { problemasDaNumeracao, saudeNumeracao } from "@/lib/db/filiacao-matricula"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { darMatriculaAction, ficarComMenorAction } from "./actions"

export const metadata: Metadata = { title: "Numeração sindical — Confluir" }

const n = (v: number) => v.toLocaleString("pt-BR")

function LinkCadastro({ id, nome }: { id: string; nome: string | null }) {
  return (
    <Link href={`/painel/filiados/${id}`} className="font-medium underline-offset-2 hover:underline">
      {nome ?? "(sem nome)"}
    </Link>
  )
}

/**
 * Saúde da numeração sindical (18/11/2026): a matrícula é sequencial — sem
 * buracos, sem repetição, e o cadastro unido fica com o menor número do grupo.
 */
export default async function NumeracaoSindicalPage({
  searchParams,
}: {
  searchParams: Promise<{ feito?: string; erro?: string }>
}) {
  const sessao = await requirePermissao("filiacao_filiados", ["filiacao_gestao"])
  const podeCorrigir = podeAcessar(sessao.permissoes, "filiacao_gestao")
  const { feito, erro } = await searchParams
  const s = await saudeNumeracao(200)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Numeração sindical</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          A matrícula sindical é sequencial: cada número de 1 até o maior pertence
          a um cadastro, nenhum se repete, e o cadastro unido fica com o menor
          número do grupo. Cadastro excluído não segura número. Cadastros novos
          recebem sempre o menor número vago, então os buracos se fecham sozinhos
          com o tempo.
        </p>
      </div>

      {feito && (
        <Alert className="border-success/40">
          <AlertDescription>{feito}</AlertDescription>
        </Alert>
      )}
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {!s ? (
        <Alert>
          <AlertDescription>Não foi possível medir a numeração agora. Tente de novo em instantes.</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Em uso", s.em_uso, false],
              ["Maior número", s.maior, false],
              ["Buracos", s.buracos, s.buracos > 0],
              ["Repetidas", s.repetidas, s.repetidas > 0],
              ["Unidos com o maior", s.unidos_maior, s.unidos_maior > 0],
              ["Sem número", s.sem_numero, s.sem_numero > 0],
            ].map(([rotulo, valor, alerta]) => (
              <Card key={String(rotulo)} className="py-3">
                <CardContent className="px-4">
                  <p className="text-muted-foreground text-xs">{rotulo}</p>
                  <p className={`text-2xl font-semibold tabular-nums ${alerta ? "text-warning-fg" : ""}`}>
                    {n(Number(valor))}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {problemasDaNumeracao(s) === 0 && (
            <Alert className="border-success/40">
              <CheckCircle2 className="text-success-fg" />
              <AlertDescription>
                Numeração em ordem: de 1 a {n(s.maior)}, sem buracos nem números repetidos.
              </AlertDescription>
            </Alert>
          )}

          {s.repetidas > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Números repetidos</CardTitle>
                <CardDescription>
                  Mais de um cadastro com a mesma matrícula. Se forem a mesma pessoa,
                  una os cadastros (fica a menor); se não, corrija a do mais novo em
                  Editar cadastro → CPF e matrícula sindical, deixando em branco para
                  receber a menor livre.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {s.lista_repetidas.map((r) => (
                    <li key={r.numero} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                      <Badge variant="outline" className="font-mono">{r.numero}</Badge>
                      {r.cadastros.map((c, i) => (
                        <span key={c.id}>
                          {i > 0 && <span className="text-muted-foreground mr-3">·</span>}
                          <LinkCadastro id={c.id} nome={c.nome} />
                          <span className="text-muted-foreground text-xs"> criado em {formatarData(c.criado.slice(0, 10))}</span>
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
                <Mais total={s.repetidas} mostrados={s.lista_repetidas.length} />
              </CardContent>
            </Card>
          )}

          {s.unidos_maior > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Unidos com o número maior</CardTitle>
                <CardDescription>
                  O cadastro que ficou de uma mesclagem usa o número maior, e o menor
                  (de um cadastro incorporado) está livre. Ficar com o menor libera o
                  maior; o número antigo continua achável na busca.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {s.lista_unidos.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <LinkCadastro id={u.id} nome={u.nome} />
                      <span className="text-muted-foreground font-mono text-xs">
                        {u.atual} → {u.menor}
                      </span>
                      {podeCorrigir && (
                        <form action={ficarComMenorAction} className="ml-auto">
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="menor" value={u.menor} />
                          <Button type="submit" size="sm" variant="outline">
                            Ficar com {u.menor}
                          </Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                <Mais total={s.unidos_maior} mostrados={s.lista_unidos.length} />
              </CardContent>
            </Card>
          )}

          {s.sem_numero > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sem matrícula sindical</CardTitle>
                <CardDescription>
                  Cadastros não excluídos sem número. Dar a matrícula usa a menor livre.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {s.lista_sem_numero.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <LinkCadastro id={c.id} nome={c.nome} />
                      <span className="text-muted-foreground text-xs">criado em {formatarData(c.criado.slice(0, 10))}</span>
                      {podeCorrigir && (
                        <form action={darMatriculaAction} className="ml-auto">
                          <input type="hidden" name="id" value={c.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Dar a matrícula
                          </Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                <Mais total={s.sem_numero} mostrados={s.lista_sem_numero.length} />
              </CardContent>
            </Card>
          )}

          {s.fora_padrao > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Matrícula fora do padrão</CardTitle>
                <CardDescription>
                  Matrícula com letras, sinais ou mais de 7 dígitos (às vezes um CPF
                  digitado no campo). Não entra na numeração. Corrija em Editar
                  cadastro → CPF e matrícula sindical.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {s.lista_fora_padrao.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <LinkCadastro id={c.id} nome={c.nome} />
                      <span className="text-muted-foreground font-mono text-xs">{c.matricula}</span>
                    </li>
                  ))}
                </ul>
                <Mais total={s.fora_padrao} mostrados={s.lista_fora_padrao.length} />
              </CardContent>
            </Card>
          )}

          {s.buracos > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Buracos na numeração</CardTitle>
                <CardDescription>
                  Números entre 1 e {n(s.maior)} que nenhum cadastro usa. Os próximos
                  cadastros novos ocupam esses números, do menor para o maior.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-1.5 text-sm">
                  {s.faixas_buracos.map((f) => (
                    <li key={f.de}>
                      <Badge variant="outline" className="font-mono font-normal">
                        {f.de === f.ate ? n(f.de) : `${n(f.de)} a ${n(f.ate)}`}
                      </Badge>
                    </li>
                  ))}
                </ul>
                {s.faixas_buracos.length >= 200 && (
                  <p className="text-muted-foreground mt-2 text-xs">Mostrando as primeiras 200 faixas.</p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  )
}

function Mais({ total, mostrados }: { total: number; mostrados: number }) {
  if (total <= mostrados) return null
  return (
    <p className="text-muted-foreground mt-2 text-xs">
      Mostrando os primeiros {n(mostrados)}. Corrija estes e a lista mostra os seguintes.
    </p>
  )
}
