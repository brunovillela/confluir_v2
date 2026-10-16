import Link from "next/link"
import { AlertTriangle, Sparkles } from "lucide-react"

import { GraficoColunas } from "@/components/graficos/colunas"
import { TileIndicador } from "@/components/graficos/tile"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OCORRENCIAS, rotuloCompetenciaPonto, type Indicadores } from "@/lib/db/ponto-analise"
import type { ResenhaGuardada } from "@/lib/db/ponto-resenha"
import { formatarDataHora } from "@/lib/formato"

import { GerarResenhaBotao } from "./botoes"

export const horas = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`

/** Indicadores do recorte: números, ocorrências, evolução, departamentos e pessoas. */
export function PainelIndicadores({
  ind,
  hrefDepartamento,
}: {
  ind: Indicadores
  /** Link de cada departamento (no ano); sem ele, a tabela não aparece. */
  hrefDepartamento?: (chave: string) => string
}) {
  const emAtencao = ind.pessoas.filter((p) => p.alertas.length > 0)
  const lidos = ind.espelhosLidos > 0
  return (
    <>
      {ind.mesesSemRemessa.length > 0 && (
        <Alert>
          <AlertTriangle />
          <AlertDescription>
            Sem remessa de ponto em {ind.mesesSemRemessa.map(rotuloCompetenciaPonto).join(", ")}. Os números do ano
            não cobrem esses meses — e a falta do registro, por si só, é um risco (art. 74 da CLT).
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <TileIndicador rotulo="Horas extras realizadas" valor={horas(ind.he)} nota={`${horas(ind.he70)} a 70% · ${horas(ind.he100)} a 100%`} />
        <TileIndicador rotulo="Funcionários com horas extras" valor={`${ind.comHE} de ${ind.funcionarios}`} />
        <TileIndicador rotulo="Média por funcionário" valor={horas(ind.heMediaPorFuncionario)} nota={ind.escopo === "remessa" ? "no mês" : "no período"} />
        <TileIndicador rotulo="Banco de horas (saldo)" valor={horas(ind.saldo)} nota="na última remessa de cada um" />
        <TileIndicador rotulo="Em atenção" valor={`${emAtencao.length}`} nota="funcionários com algum alerta" />
        <TileIndicador
          rotulo="Atestados"
          valor={`${ind.atestados}`}
          nota={`${ind.diasAtestado} dia(s) · ${ind.faltasInjustificadas} falta(s) injustificada(s)`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jornada pelas marcações do espelho</CardTitle>
          <CardDescription>
            {ind.espelhos === 0
              ? "Nenhum espelho anexado neste recorte."
              : `${ind.espelhosLidos} de ${ind.espelhos} espelho(s) com as marcações lidas` +
                (ind.espelhosEscaneados ? ` · ${ind.espelhosEscaneados} escaneado(s), sem texto, ficam de fora` : "") +
                "."}
          </CardDescription>
        </CardHeader>
        {lidos && (
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {OCORRENCIAS.map((o) => {
              const v = ind.ocorrencias[o.id]
              return (
                <div key={o.id} className={`rounded-md border px-3 py-2 ${v.total > 0 ? "border-warning/50" : ""}`}>
                  <p className="text-sm font-medium">
                    {o.rotulo}: <span className="tabular-nums">{v.total}</span>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {v.funcionarios} funcionário(s) · {o.fundamento}
                  </p>
                </div>
              )
            })}
            <div className={`rounded-md border px-3 py-2 ${ind.britanicos > 0 ? "border-warning/50" : ""}`}>
              <p className="text-sm font-medium">
                Ponto &quot;britânico&quot;: <span className="tabular-nums">{ind.britanicos}</span>
              </p>
              <p className="text-muted-foreground text-xs">horários invariáveis · Súmula 338 do TST</p>
            </div>
          </CardContent>
        )}
      </Card>

      {ind.serie.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Horas extras por mês</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoColunas
              titulo="Horas extras por mês"
              categorias={ind.serie.map((s) => rotuloCompetenciaPonto(s.competencia).replace(/^(\w{3})\w*\//, "$1/"))}
              series={[
                { nome: "70%", valores: ind.serie.map((s) => s.he70) },
                { nome: "100%", valores: ind.serie.map((s) => s.he100) },
              ]}
              empilhado
            />
          </CardContent>
        </Card>
      )}

      {hrefDepartamento && ind.departamentos.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Departamentos</CardTitle>
            <CardDescription>Departamento atual de cada funcionário. Clique para ver os indicadores e a resenha da área.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Departamento</TableHead>
                    <TableHead className="text-right">Funcionários</TableHead>
                    <TableHead className="text-right">Horas extras</TableHead>
                    <TableHead className="text-right">Média</TableHead>
                    <TableHead className="text-right">A 100%</TableHead>
                    <TableHead className="text-right">Banco</TableHead>
                    <TableHead className="text-right">Ocorrências</TableHead>
                    <TableHead className="text-right">Em atenção</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ind.departamentos.map((d) => (
                    <TableRow key={d.chave}>
                      <TableCell className="font-medium">
                        <Link href={hrefDepartamento(d.chave)} className="hover:underline">
                          {d.nome}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.funcionarios}</TableCell>
                      <TableCell className="text-right tabular-nums">{horas(d.he)}</TableCell>
                      <TableCell className="text-right tabular-nums">{horas(d.heMedia)}</TableCell>
                      <TableCell className="text-right tabular-nums">{horas(d.he100)}</TableCell>
                      <TableCell className="text-right tabular-nums">{horas(d.saldo)}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.ocorrencias}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.emAtencao}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funcionários em atenção</CardTitle>
          <CardDescription>
            {emAtencao.length === 0
              ? "Nenhum funcionário com alerta neste recorte."
              : `${emAtencao.length} de ${ind.funcionarios}, do mais ao menos crítico. Os alertas seguem regras fixas da CLT e do TST.`}
          </CardDescription>
        </CardHeader>
        {emAtencao.length > 0 && (
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead className="text-right">Horas extras</TableHead>
                    {ind.escopo !== "remessa" && <TableHead className="text-right">Meses com HE</TableHead>}
                    <TableHead className="text-right">Banco</TableHead>
                    <TableHead>Alertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emAtencao.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="min-w-44 align-top">
                        <Link href={`/painel/pessoal/ponto/funcionario/${p.id}`} className="font-medium hover:underline">
                          {p.nome}
                        </Link>
                        <span className="text-muted-foreground block text-xs">{p.departamento}</span>
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">{horas(p.he)}</TableCell>
                      {ind.escopo !== "remessa" && (
                        <TableCell className="text-right align-top tabular-nums">
                          {p.mesesComHE}/{p.meses}
                        </TableCell>
                      )}
                      <TableCell className="text-right align-top tabular-nums">{horas(p.saldo)}</TableCell>
                      <TableCell className="min-w-80 align-top whitespace-normal">
                        <ul className="list-disc pl-4 text-xs">
                          {p.alertas.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>
    </>
  )
}

const GRAVIDADE = {
  alta: { rotulo: "Alta", variante: "destructive" },
  media: { rotulo: "Média", variante: "warning" },
  baixa: { rotulo: "Baixa", variante: "info" },
} as const

/** A resenha guardada (ou o convite para gerar) com o botão de gerar de novo. */
export function CartaoResenha({
  disponivel,
  resenha,
  escopo,
  remessaId,
  ano,
  departamento,
}: {
  disponivel: boolean
  resenha: ResenhaGuardada | null
  escopo: "remessa" | "ano" | "departamento"
  remessaId?: string
  ano?: string
  departamento?: string
}) {
  const c = resenha?.conteudo
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="text-primary size-4" /> Resenha da IA
        </CardTitle>
        <CardDescription>
          {resenha
            ? `Gerada em ${formatarDataHora(resenha.geradaEm)}${resenha.geradaPor ? ` por ${resenha.geradaPor}` : ""}. Parte dos indicadores desta tela; confira antes de agir.`
            : "Riscos trabalhistas, funcionários e departamentos a acompanhar e o que fazer — redigido a partir dos indicadores desta tela."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!disponivel && (
          <Alert>
            <AlertDescription>
              Rode <code>supabase/ponto-analise.sql</code> no SQL Editor para guardar as resenhas.
            </AlertDescription>
          </Alert>
        )}
        {c && (
          <>
            <div className="grid gap-2 text-sm leading-relaxed whitespace-pre-wrap">{c.panorama}</div>

            {c.riscos.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Riscos trabalhistas</h3>
                {c.riscos.map((r, i) => (
                  <div key={i} className="rounded-md border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={GRAVIDADE[r.gravidade]?.variante ?? "outline"}>{GRAVIDADE[r.gravidade]?.rotulo ?? r.gravidade}</Badge>
                      <span className="text-sm font-medium">{r.titulo}</span>
                    </div>
                    <p className="mt-1 text-sm">{r.descricao}</p>
                    {r.fundamento && <p className="text-muted-foreground mt-1 text-xs">{r.fundamento}</p>}
                  </div>
                ))}
              </section>
            )}

            {c.acompanhar_funcionarios.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Acompanhar de perto — funcionários</h3>
                <ul className="grid gap-2 text-sm">
                  {c.acompanhar_funcionarios.map((p, i) => (
                    <li key={i} className="rounded-md border px-3 py-2">
                      <span className="font-medium">{p.nome}</span> — {p.motivo}
                      <span className="text-muted-foreground block text-xs">Sugestão: {p.sugestao}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {c.acompanhar_departamentos.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Acompanhar de perto — departamentos</h3>
                <ul className="grid gap-2 text-sm">
                  {c.acompanhar_departamentos.map((d, i) => (
                    <li key={i} className="rounded-md border px-3 py-2">
                      <span className="font-medium">{d.nome}</span> — {d.motivo}
                      <span className="text-muted-foreground block text-xs">Sugestão: {d.sugestao}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {c.recomendacoes.length > 0 && (
              <section className="grid gap-1">
                <h3 className="text-sm font-semibold">Recomendações</h3>
                <ul className="list-disc pl-5 text-sm">
                  {c.recomendacoes.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}

            {c.limitacoes && <p className="text-muted-foreground text-xs">Limitações: {c.limitacoes}</p>}
          </>
        )}
        {disponivel && (
          <GerarResenhaBotao escopo={escopo} remessaId={remessaId} ano={ano} departamento={departamento} jaExiste={Boolean(resenha)} />
        )}
      </CardContent>
    </Card>
  )
}
