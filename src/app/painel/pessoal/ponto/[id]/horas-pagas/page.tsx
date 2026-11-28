import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Settings } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { faixasHoraExtra } from "@/lib/db/ponto-config"
import { previaHorasPagas, remessasCCParaPonto } from "@/lib/db/ponto-horas-pagas"
import { formatarMoeda } from "@/lib/formato"
import { hhmm } from "@/lib/horas"

import { AplicarHorasPagasForm, InterpretarAmbiguasBotao, LerDeNovoBotao, LerEscaneadosBotao, type LinhaTela } from "./forms"

export const metadata: Metadata = { title: "Horas pagas pelo contracheque — Confluir" }
// Abre um PDF por pessoa; a IA (quando pedida) leva mais.
export const maxDuration = 300

/**
 * Horas extras pagas lidas do contracheque (Ponto, Fase 2 — 28/11/2026): a
 * remessa de ponto indica a remessa de contracheques; o texto de cada PDF é
 * lido no servidor e a prévia mostra o que muda antes de gravar.
 */
export default async function HorasPagasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ cc?: string; aplicados?: string; recalculadas?: string; parada?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { id } = await params
  const sp = await searchParams
  const primeira = await previaHorasPagas(id, null)
  if (!primeira) notFound()
  const remessas = await remessasCCParaPonto(primeira.remessa.competencia)
  const ccId = sp.cc ?? primeira.remessa.ccRemessaId ?? remessas.find((r) => r.sugerida)?.id ?? null
  const [previa, faixas] = await Promise.all([ccId ? previaHorasPagas(id, ccId) : Promise.resolve(primeira), faixasHoraExtra()])
  if (!previa) notFound()
  const { remessa, config, cc } = previa
  const voltar = `/painel/pessoal/ponto/${id}`

  const linhas: LinhaTela[] = previa.linhas.map((l) => ({
    registroId: l.registroId,
    nome: l.nome,
    situacao: l.leitura.situacao,
    erro: l.leitura.erro,
    linhas: l.leitura.linhas,
    atual: l.atual,
    novo: l.novo,
    diferente: l.diferente,
    podeAplicar: l.podeAplicar,
  }))
  const conta = (s: string) => linhas.filter((l) => l.situacao === s).length
  const ambiguas = linhas.reduce((n, l) => n + l.linhas.filter((x) => x.ambigua).length, 0)
  const escaneados = conta("sem_texto")
  const lidos = conta("lido")
  const aGravar = linhas.filter((l) => l.podeAplicar && l.diferente)
  const soma = (k: "horas1" | "horas2" | "valor1" | "valor2") => linhas.filter((l) => l.podeAplicar).reduce((s, l) => s + (l.novo[k] ?? 0), 0)

  return (
    <>
      <RotuloTrilha valores={{ [id]: remessa.nome }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={voltar}>
            <ArrowLeft />
            {remessa.nome}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Horas extras pagas pelo contracheque</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Escolha a remessa de contracheques em que as horas extras de {remessa.nome} foram pagas (em geral a do mês
          seguinte). Cada PDF é lido aqui, pelo texto, só nas linhas das rubricas de hora extra; você confere e grava.
        </p>
      </div>

      {sp.aplicados && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Horas pagas gravadas em {sp.aplicados} registro(s).
            {sp.recalculadas !== undefined &&
              (sp.recalculadas ? ` Saldos recalculados em: ${sp.recalculadas.split("|").join(", ")}.` : " Nenhuma remessa seguinte para recalcular.")}
            {sp.parada && ` ${sp.parada} está finalizada: ela e as seguintes ficaram como estavam.`}
          </AlertDescription>
        </Alert>
      )}
      {!config.disponivel && (
        <Alert variant="warning">
          <AlertDescription>A migração das horas pagas ainda não foi aplicada neste banco.</AlertDescription>
        </Alert>
      )}
      {config.disponivel && config.rubricas.length === 0 && (
        <Alert variant="warning">
          <AlertDescription>
            Nenhuma rubrica de hora extra configurada. Informe como elas aparecem no contracheque em{" "}
            <Link href="/painel/pessoal/contracheques/configuracao#horas-extras" className="underline underline-offset-4">
              Contracheques → Configuração
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}
      {remessa.finalizada && (
        <Alert variant="warning">
          <AlertDescription>A remessa de ponto está finalizada: dá para conferir, mas não para gravar.</AlertDescription>
        </Alert>
      )}

      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-muted-foreground text-xs">Remessa de contracheques</span>
          <select
            name="cc"
            defaultValue={ccId ?? ""}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          >
            <option value="">Escolha</option>
            {remessas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome} · {r.itens} contracheque(s){r.sugerida ? " · sugerida" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Ler
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/painel/pessoal/contracheques/configuracao#horas-extras">
            <Settings />
            Rubricas
          </Link>
        </Button>
      </form>

      {cc && config.rubricas.length > 0 && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TileIndicador
              rotulo="Lidos"
              valor={`${lidos} de ${linhas.length}`}
              nota={`${aGravar.length} com diferença a gravar${previa.semRegistro ? ` · ${previa.semRegistro} contracheque(s) sem registro nesta remessa` : ""}`}
            />
            <TileIndicador rotulo={`Pagas ${faixas["70"]}`} valor={hhmm(soma("horas1"))} nota={formatarMoeda(soma("valor1"))} />
            <TileIndicador rotulo={`Pagas ${faixas["100"]}`} valor={hhmm(soma("horas2"))} nota={formatarMoeda(soma("valor2"))} />
            <TileIndicador
              rotulo="A conferir"
              valor={`${ambiguas + escaneados + conta("sem_contracheque") + conta("sem_arquivo") + conta("erro")}`}
              nota={[
                ambiguas && `${ambiguas} linha(s) ambígua(s)`,
                escaneados && `${escaneados} escaneado(s)`,
                conta("sem_contracheque") && `${conta("sem_contracheque")} sem contracheque`,
              ]
                .filter(Boolean)
                .join(" · ") || "nada"}
            />
          </section>

          {(ambiguas > 0 || escaneados > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">O que o texto não resolveu</CardTitle>
                <CardDescription>
                  Essas pessoas ficam de fora da gravação até a leitura ficar completa. Você também pode digitar as horas
                  pagas no registro, como sempre.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                {ambiguas > 0 &&
                  (config.iaLinhas ? (
                    <div className="grid gap-1">
                      <p>
                        {ambiguas} linha(s) de hora extra sem horas e valor claros. A IA pode interpretá-las recebendo só
                        a linha, sem nome nem CPF.
                      </p>
                      <InterpretarAmbiguasBotao remessaId={id} cc={cc.id} quantas={ambiguas} />
                    </div>
                  ) : (
                    <p>
                      {ambiguas} linha(s) de hora extra sem horas e valor claros. A interpretação pela IA está desligada na
                      configuração; confira a rubrica (talvez falte o percentual na descrição) ou digite no registro.
                    </p>
                  ))}
                {escaneados > 0 &&
                  (config.lerImagem ? (
                    <div className="grid gap-1">
                      <p>
                        {escaneados} contracheque(s) escaneado(s), sem texto. A leitura por imagem manda o contracheque
                        inteiro (nome, CPF, salário e descontos) à IA.
                      </p>
                      <LerEscaneadosBotao remessaId={id} cc={cc.id} quantos={escaneados} />
                    </div>
                  ) : (
                    <p>
                      {escaneados} contracheque(s) escaneado(s), sem texto: não dá para ler sem IA, e a leitura por
                      imagem está desligada (ela mandaria o contracheque inteiro à IA). Peça o PDF gerado pelo sistema da
                      folha ou digite no registro.
                    </p>
                  ))}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Prévia por funcionário</h2>
            <LerDeNovoBotao remessaId={id} cc={cc.id} />
          </div>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground text-sm">Esta remessa de ponto não tem registros.</p>
          ) : (
            <AplicarHorasPagasForm remessaId={id} cc={cc.id} linhas={linhas} faixas={faixas} bloqueada={remessa.finalizada} />
          )}
        </>
      )}
    </>
  )
}
