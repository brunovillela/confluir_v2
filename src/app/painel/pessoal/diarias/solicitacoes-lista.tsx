import Link from "next/link"
import { HandCoins } from "lucide-react"

import { SituacaoDiariaBadge } from "@/components/diarias"
import { Paginacao } from "@/components/paginacao"
import { AvatarPessoa } from "@/components/pessoa-nome"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SITUACOES_DIARIA, type SolicitacaoDiaria } from "@/lib/db/diarias"
import { fotosDosUsuarios } from "@/lib/db/fotos-usuarios"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { semAcento } from "@/lib/texto"

const ROTULOS_SITUACAO: Record<string, string> = {
  aguardando: "Aguardando avaliação",
  aprovada: "Aprovadas",
  reprovada: "Reprovadas",
  cancelada: "Canceladas",
}

/** Aba "Solicitações" das Diárias (a lista de antes do padrão de 3 níveis). */
export async function ListaSolicitacoesDiaria({
  solicitacoes,
  brutos,
  noHistorico,
}: {
  solicitacoes: SolicitacaoDiaria[]
  brutos: Record<string, string | undefined>
  noHistorico: number
}) {
  const params = {
    busca: (brutos.busca ?? "").trim(),
    situacao: (SITUACOES_DIARIA as readonly string[]).includes(brutos.situacao ?? "") ? brutos.situacao! : "todas",
  }
  const termo = semAcento(params.busca)
  const filtradas = solicitacoes.filter((s) => {
    if (termo && !semAcento(s.funcionarioNome ?? "").includes(termo)) return false
    if (params.situacao !== "todas" && s.situacao !== params.situacao) return false
    return true
  })
  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(filtradas, paginacao)
  const fotos = await fotosDosUsuarios(paginaAtual.linhas.map((s) => s.funcionario_id))

  return (
    <>
      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="aba" value="solicitacoes" />
        <Input
          name="busca"
          defaultValue={params.busca}
          placeholder="Nome do funcionário"
          className="h-9 w-full sm:max-w-56"
          aria-label="Buscar por funcionário"
        />
        <SelectNativo name="situacao" defaultValue={params.situacao} aria-label="Filtrar por situação" className="h-9 w-auto">
          <option value="todas">Todas as situações</option>
          {SITUACOES_DIARIA.map((s) => (
            <option key={s} value={s}>
              {ROTULOS_SITUACAO[s]}
            </option>
          ))}
        </SelectNativo>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
        <span className="text-muted-foreground text-xs">{filtradas.length} solicitação(ões)</span>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Funcionário</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="hidden md:table-cell">Período</TableHead>
                <TableHead className="hidden lg:table-cell">Solicitada em</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginaAtual.total === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-40">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <HandCoins className="size-6" />
                      <p className="text-sm">
                        Nenhuma solicitação de diária
                        {params.busca && <> para “{params.busca}”</>}.
                      </p>
                      {noHistorico > 0 && (
                        <p className="text-sm">
                          As diárias lançadas no sistema anterior estão no{" "}
                          <Link href="/painel/pessoal/diarias/historico" className="text-primary underline-offset-4 hover:underline">
                            histórico ({noHistorico.toLocaleString("pt-BR")} remessas)
                          </Link>
                          .
                        </p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginaAtual.linhas.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-56 font-medium">
                    {s.funcionario_id ? (
                      <div className="flex min-w-0 items-center gap-2">
                        <AvatarPessoa nome={s.funcionarioNome} fotoUrl={fotos.get(s.funcionario_id)} />
                        <Link href={`/painel/pessoal/diarias/funcionario/${s.funcionario_id}`} className="min-w-0 hover:underline">
                          <span className="block truncate">{s.funcionarioNome ?? "(sem nome)"}</span>
                        </Link>
                      </div>
                    ) : (
                      "(sem funcionário)"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-40 truncate">{s.tipoNome ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.quantidade ?? "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(s.valor_total)}
                    {s.valorDespesas > 0 && (
                      <span className="text-muted-foreground block text-xs">+ {formatarMoeda(s.valorDespesas)} em despesas</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                    {s.data_inicio ? (
                      <>
                        {formatarData(s.data_inicio)}
                        {s.data_termino && s.data_termino !== s.data_inicio && <> – {formatarData(s.data_termino)}</>}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap lg:table-cell">{formatarData(s.created_at)}</TableCell>
                  <TableCell>
                    <SituacaoDiariaBadge situacao={s.situacao} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                      <Link href={`/painel/pessoal/diarias/${s.id}?de=solicitacoes`}>Ver</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Paginacao
        total={paginaAtual.total}
        pagina={paginaAtual.pagina}
        totalPaginas={paginaAtual.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />
    </>
  )
}
