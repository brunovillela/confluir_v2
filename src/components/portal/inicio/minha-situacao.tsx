import Link from "next/link"
import { ArrowRight, QrCode, TriangleAlert } from "lucide-react"

import { Indisponivel } from "@/components/portal/inicio/indisponivel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { situacaoContribuicao, situacaoSemHistorico } from "@/lib/contribuicao-situacao"
import type { Filiado } from "@/lib/contas"
import { minhaContribuicao, type MinhaContribuicao } from "@/lib/db/carteirinha"
import { cobrancasDoFiliado, rotuloCompetencia } from "@/lib/db/cobrancas"
import { registrosDaPessoa, seguro } from "@/lib/db/portal-inicio"
import { formatarMoeda } from "@/lib/formato"

import { tentar } from "./cargas"

/** "a, b e c" */
function juntar(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
}

/** DD/MM de uma data AAAA-MM-DD. */
function diaMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`
}

/**
 * Minha situação (A2): a primeira coisa que quem paga quer saber ao entrar —
 * se está em dia, quanto foi a última contribuição e se há Pix para pagar. O
 * rótulo vem de situacaoContribuicao(), a mesma régua da página "Minha
 * contribuição", para os dois nunca dizerem coisas diferentes.
 *
 * Em atraso ou com faltas, um alerta curto vem antes da faixa: é a última das
 * pendências do Início (logo depois de votação, oposição e avaliação).
 * minhaContribuicao faz várias consultas — por isso a faixa carrega no seu
 * próprio Suspense e, se falhar, diz que a situação está indisponível em vez
 * de "Em dia".
 */
export async function MinhaSituacao({ filiado }: { filiado: Filiado }) {
  const [c, rCobrancas] = await Promise.all([
    seguro<MinhaContribuicao | null>("contribuição", () => minhaContribuicao(filiado.cpf, filiado.filiacaoId), null),
    tentar("cobranças Pix", async () => (await cobrancasDoFiliado(await registrosDaPessoa(filiado.cpf))).cobrancas),
  ])
  const cobrancas = rCobrancas?.valor ?? []
  // Sem a apuração, a régua já devolve "Situação indisponível" — nunca "Em dia".
  // Com ela, a mesma variante da página: recém-filiado sem histórico vê
  // "Aguardando o primeiro desconto", não "Em dia" (A126).
  const sit = c ? situacaoSemHistorico(c) : situacaoContribuicao({ inadimplente: null, emFalta: [] })
  // A lista vem da competência mais nova para a mais antiga: a primeira aberta
  // é a mesma que a página de Contribuição mostra com o QR Code.
  const abertas = cobrancas.filter((x) => x.situacao === "aberta")
  const aberta = abertas[0] ?? null

  return (
    <>
      {c && sit.chave === "atraso" && (
        <Alert variant="error">
          <TriangleAlert />
          <AlertTitle>Sua contribuição consta como em atraso</AlertTitle>
          <AlertDescription>
            Nada é suspenso automaticamente: a secretaria analisa cada caso e pode limitar serviços enquanto o atraso constar.{" "}
            {c.porPix
              ? "Se você já pagou, avise o sindicato com o comprovante."
              : "Se o desconto está sendo feito, avise o sindicato com o contracheque."}{" "}
            <Link href="/portal/contribuicao" className="font-medium pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">
              Ver detalhes
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {c && sit.chave === "faltas" && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>{c.porPix ? "Pagamento não localizado" : "Contribuição não localizada"}</AlertTitle>
          <AlertDescription>
            {c.porPix
              ? `Não encontramos o pagamento da sua contribuição de ${juntar(c.emFalta)}.`
              : `Não encontramos sua contribuição de ${juntar(c.emFalta)} ${c.emFalta.length === 1 ? "no repasse" : "nos repasses"} da sua fonte pagadora.`}{" "}
            <Link href="/portal/contribuicao" className="font-medium pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">
              Ver o que fazer
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Minha situação
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 sm:items-center">
          <div>
            <p className="text-muted-foreground text-xs">Contribuição</p>
            <p className="mt-1">
              <Badge variant={sit.variante}>{sit.rotulo}</Badge>
            </p>
            {sit.apoio && <p className="text-muted-foreground mt-1 text-sm">{sit.apoio}</p>}
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Última contribuição</p>
            {c?.ultima ? (
              <>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatarMoeda(c.ultima.valor)}</p>
                <p className="text-muted-foreground text-sm">
                  {c.ultima.competencia} · {c.ultima.fonte ?? "fonte não informada"}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">
                {c ? "Nenhuma contribuição registrada ainda." : "Não foi possível carregar agora."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button variant="outline" asChild>
              <Link href="/portal/contribuicao">Ver contribuição</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/portal/carteirinha">Carteirinha</Link>
            </Button>
          </div>
        </CardContent>
        {aberta && (
          <CardContent>
            <Link
              href="/portal/contribuicao"
              className="border-primary/40 bg-primary/5 hover:bg-primary/10 flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors"
            >
              <span className="flex min-w-0 items-center gap-2">
                <QrCode className="text-primary size-4 shrink-0" aria-hidden />
                <span>
                  <strong className="font-semibold">Contribuição de {rotuloCompetencia(aberta.competencia)}</strong>{" "}
                  {aberta.vencida ? "venceu" : "vence"} em {diaMes(aberta.vencimento)} — pagar por Pix ·{" "}
                  <span className="tabular-nums">{formatarMoeda(aberta.valor)}</span>
                  {abertas.length > 1 && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {abertas.length} cobranças em aberto
                    </span>
                  )}
                </span>
              </span>
              <ArrowRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
            </Link>
          </CardContent>
        )}
        {/* Quem paga por Pix e a lista de cobranças não veio: não dá para
            dizer que não há nada a pagar (A187). */}
        {c?.porPix && !rCobrancas && (
          <CardContent>
            <Indisponivel className="text-xs">Não foi possível conferir agora se há cobrança por Pix em aberto.</Indisponivel>
          </CardContent>
        )}
      </Card>
    </>
  )
}

/** Enquanto a situação é apurada: a faixa no mesmo tamanho, para nada pular. */
export function EsqueletoMinhaSituacao() {
  return <Skeleton aria-hidden className="h-36 w-full rounded-xl sm:h-28" />
}
