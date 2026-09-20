import type { Metadata } from "next"
import Link from "next/link"
import { HandCoins } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SituacaoDiariaBadge } from "@/components/diarias"
import { DespesasDaDiaria } from "@/components/diaria-despesas-form"
import { requireSessaoPainel } from "@/lib/auth"
import { listarTiposDespesaDiaria } from "@/lib/db/diarias-config"
import { urlComprovanteDespesa } from "@/lib/db/diarias-despesas"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import { exigirFuncionario } from "@/lib/db/perfil"
import {
  listarTiposDiaria,
  minhasSolicitacoesDiaria,
  tipoDiariaLiberado,
} from "@/lib/db/diarias"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { adicionarMinhaDespesa, removerMinhaDespesa } from "./actions"
import { CancelarDiariaBotao, SolicitarDiariaForm } from "./solicitacao-form"

export const metadata: Metadata = { title: "Minhas diárias — Confluir" }

/** Autosserviço: cada funcionário solicita e acompanha as PRÓPRIAS diárias. */
export default async function MinhasDiariasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requireSessaoPainel()
  // Pedem diária: funcionário com vínculo em vigor E diretor em exercício —
  // quem não é nem um nem outro volta ao perfil.
  const quadro = await quadroParaDiaria(sessao.usuario.id as string)
  if (!quadro) {
    await exigirFuncionario(sessao.usuario.id as string, { ativo: true })
  }
  const { salvo } = await searchParams
  const [{ disponivel, solicitacoes }, { tipos }, tiposDespesa] = await Promise.all([
    minhasSolicitacoesDiaria(sessao.usuario.id as string),
    listarTiposDiaria(),
    listarTiposDespesaDiaria(),
  ])

  const ativos = tipos.filter(
    (t) =>
      t.ativa &&
      t.valor_reembolso !== null &&
      tipoDiariaLiberado(t, sessao.usuario.id as string, quadro?.quadro)
  )
  const emAvaliacao = solicitacoes.filter((s) => s.situacao === "aguardando")
  const urlsComprovantes = new Map(
    await Promise.all(
      emAvaliacao
        .flatMap((s) => s.despesas)
        .map(async (d) => [d.id, await urlComprovanteDespesa(d.comprovante)] as const)
    )
  )

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Minhas diárias
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Solicite diárias por atividades específicas (viagens, representações)
          e acompanhe a avaliação e o pagamento.{" "}
          <Link href="/painel/perfil/diarias/historico" className="text-primary underline-offset-4 hover:underline">
            Diárias anteriores
          </Link>
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            As diárias ainda não estão configuradas no sistema — procure o
            departamento de pessoal.
          </AlertDescription>
        </Alert>
      )}

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Solicitação enviada — você será avisado quando for avaliada.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <SolicitarDiariaForm
          tipos={ativos.map((t) => ({
            id: t.id,
            rotulo: `${t.nome} — ${formatarMoeda(t.valor_reembolso)}`,
          }))}
        />
      )}

      {emAvaliacao.map((s) => (
        <DespesasDaDiaria
          key={s.id}
          solicitacaoId={s.id}
          despesas={s.despesas.map((d) => ({
            id: d.id,
            tipoNome: d.tipoNome,
            descricao: d.descricao,
            valor: d.valor,
            comprovanteUrl: urlsComprovantes.get(d.id) ?? null,
          }))}
          tipos={tiposDespesa.tipos
            .filter((t) => t.ativa)
            .map((t) => ({ id: t.id, nome: t.nome, exigeComprovante: t.exigeComprovante }))}
          acaoAdicionar={adicionarMinhaDespesa}
          acaoRemover={removerMinhaDespesa}
        />
      ))}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Minhas solicitações</CardTitle>
            <HandCoins className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {solicitacoes.length} solicitaç
            {solicitacoes.length === 1 ? "ão" : "ões"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {solicitacoes.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Você ainda não solicitou nenhuma diária.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Período
                    </TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Pagamento
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {solicitacoes.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="max-w-44 truncate font-medium">
                        {s.tipoNome ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.quantidade ?? "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(s.valor_total)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                        {s.data_inicio ? (
                          <>
                            {formatarData(s.data_inicio)}
                            {s.data_termino &&
                              s.data_termino !== s.data_inicio && (
                                <> – {formatarData(s.data_termino)}</>
                              )}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <SituacaoDiariaBadge situacao={s.situacao} />
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {s.situacao === "aprovada"
                          ? (s.ordemSituacao ?? "Em processamento")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.situacao === "aguardando" ? (
                          <CancelarDiariaBotao id={s.id} />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
