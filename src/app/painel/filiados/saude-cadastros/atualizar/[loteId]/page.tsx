import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, TriangleAlert, UserMinus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { exibirValor, ROTULOS_CAMPO } from "@/lib/atualizacao-lista"
import { requirePermissao } from "@/lib/auth"
import { lerLote } from "@/lib/db/filiacao-atualizacao-lista"
import { formatarDataHora } from "@/lib/formato"

import { SituacaoLote } from "../situacao-lote"
import { DescartarRascunho, DesfazerLote } from "./acoes-lote"
import { AcompanharLeitura } from "./acompanhar-leitura"
import { NaoEncontrados } from "./nao-encontrados"
import { Previa, type PessoaPrevia } from "./previa"

export const metadata: Metadata = { title: "Lista de trabalhadores — Confluir" }
// Aplicar e desfazer milhares de campos passa do tempo padrão.
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xl font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</div>
      <div className="text-muted-foreground text-xs">{rotulo}</div>
    </div>
  )
}

export default async function LoteListaPage({
  params,
  searchParams,
}: {
  params: Promise<{ loteId: string }>
  searchParams: Promise<{ parcial?: string }>
}) {
  await requirePermissao("filiacao_gestao")
  const { loteId } = await params
  const { parcial } = await searchParams
  if (!UUID.test(loteId)) notFound()
  const dados = await lerLote(loteId)
  if (!dados) notFound()
  const { lote, itens, nomes } = dados

  // Por pessoa, só os campos principais (o espelho fonte_pg_* vai junto).
  const pessoas = new Map<string, PessoaPrevia>()
  for (const i of itens) {
    if (i.acompanha !== null) continue
    if (lote.situacao !== "rascunho" && !i.aplicado) continue
    const p = pessoas.get(i.filiadoId) ?? {
      filiadoId: i.filiadoId,
      nome: nomes.get(i.filiadoId) ?? null,
      via: i.via,
      linha: i.linha,
      campos: [],
    }
    p.campos.push({ seq: i.seq, campo: i.campo, anterior: i.anterior, novo: i.novo, marcadoPadrao: i.marcadoPadrao })
    pessoas.set(i.filiadoId, p)
  }
  const lista = [...pessoas.values()].sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
  const desfeitos = new Set(itens.filter((i) => i.desfeito).map((i) => i.seq))
  const encontrados = new Set(itens.map((i) => i.filiadoId)).size
  const camposAplicados = itens.filter((i) => i.aplicado && i.acompanha === null).length

  const cabecalho = (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href="/painel/filiados/saude-cadastros/atualizar">
          <ArrowLeft />
          Atualizar cadastros por lista
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{lote.arquivo}</h1>
        <SituacaoLote situacao={lote.situacao} />
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        {lote.fonteNome ? `Fonte: ${lote.fonteNome}` : "Sem fonte pagadora"} · enviada em {formatarDataHora(lote.criadoEm)}
        {lote.criadoPorNome ? ` por ${lote.criadoPorNome}` : ""}
        {lote.aplicadoEm ? ` · aplicada em ${formatarDataHora(lote.aplicadoEm)}` : ""}
        {lote.desfeitoEm ? ` · desfeita em ${formatarDataHora(lote.desfeitoEm)}` : ""}
      </p>
    </div>
  )

  // A IA ainda lê (segundo plano) ou a leitura falhou: não há prévia ainda.
  if (lote.situacao === "lendo" || lote.situacao === "erro") {
    return (
      <>
        {cabecalho}
        {lote.situacao === "lendo" ? (
          <AcompanharLeitura progresso={lote.progresso} />
        ) : (
          <Alert variant="destructive">
            <AlertDescription className="grid gap-2">
              <span>
                <strong>A leitura falhou.</strong> {lote.erro ?? "Envie a lista de novo."} Nada foi gravado nos
                cadastros.
              </span>
              <span>
                <DescartarRascunho loteId={lote.id} rotulo="Descartar" />
              </span>
            </AlertDescription>
          </Alert>
        )}
      </>
    )
  }

  return (
    <>
      {cabecalho}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="trabalhadores lidos" valor={lote.linhasLidas} />
        <Numero rotulo={lote.situacao === "rascunho" ? "com algo a atualizar" : "cadastros atualizados"} valor={lote.situacao === "rascunho" ? lista.length : (lote.resumo?.pessoas ?? 0)} />
        <Numero rotulo="não encontrados" valor={lote.naoEncontrados.length} />
        <Numero rotulo="descartados" valor={lote.descartadas.length} />
      </div>

      {parcial && (
        <Alert variant="destructive">
          <AlertDescription>Parte dos campos não foi gravada por erro do banco. O que entrou está abaixo.</AlertDescription>
        </Alert>
      )}
      {lote.avisos.map((a) => (
        <Alert key={a} variant="warning">
          <TriangleAlert />
          <AlertDescription>{a}</AlertDescription>
        </Alert>
      ))}

      {lote.sairam.length > 0 && lote.situacao !== "desfeito" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saíram da empresa, segundo a lista</CardTitle>
            <CardDescription>
              {lote.sairam.length} pessoa(s) com data de saída. A filiação não muda sozinha: abra o vínculo,
              confira e, se for o caso, registre a data de desfiliação e o motivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {lote.sairam.map((s) => (
                <li key={s.filiadoId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <Link href={`/painel/filiados/${s.filiadoId}`} className="font-medium underline-offset-4 hover:underline">
                      {nomes.get(s.filiadoId) ?? s.nome ?? "(sem nome)"}
                    </Link>
                    <span className="text-muted-foreground ml-2 text-xs">saída em {exibirValor("data_saida_demissao", s.saida)}</span>
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={
                        s.vinculoId
                          ? `/painel/filiados/${s.filiadoId}/vinculos/${s.vinculoId}`
                          : `/painel/filiados/${s.filiadoId}`
                      }
                    >
                      <UserMinus />
                      {s.vinculoId ? "Avaliar a desfiliação" : "Abrir a ficha"}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {lote.situacao === "rascunho" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Conferir e aplicar</CardTitle>
                <CardDescription>
                  {encontrados} cadastro(s) encontrado(s); {lista.length} com algo a mudar (os outros já estão
                  iguais à lista). Campo vazio no cadastro vem marcado; troca de valor e pessoa achada só pelo
                  nome vêm desmarcadas — confira antes.
                </CardDescription>
              </div>
              <DescartarRascunho loteId={lote.id} />
            </div>
          </CardHeader>
          <CardContent>
            {lista.length ? (
              <Previa loteId={lote.id} pessoas={lista} />
            ) : (
              <p className="text-muted-foreground text-sm">Nenhum cadastro encontrado tem algo diferente da lista.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {lote.situacao === "desfeito" ? "O que foi gravado e desfeito" : "O que foi gravado"}
            </CardTitle>
            <CardDescription>
              {camposAplicados} campo(s) em {lote.resumo?.pessoas ?? 0} cadastro(s)
              {lote.resumo?.conflitos ? ` · ${lote.resumo.conflitos} não gravado(s) porque o cadastro mudou depois da prévia` : ""}
              {lote.situacao === "desfeito"
                ? ` · ${lote.resumo?.desfeitosCampos ?? 0} voltaram ao valor anterior${lote.resumo?.mantidosPorMudanca ? `; ${lote.resumo.mantidosPorMudanca} ficaram porque alguém os alterou depois` : ""}`
                : ""}
              . Cada cadastro tem a anotação no prontuário.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {lote.situacao === "aplicado" && camposAplicados > 0 && <DesfazerLote loteId={lote.id} campos={camposAplicados} />}
            <ul className="divide-y rounded-lg border">
              {lista.map((p) => (
                <li key={p.filiadoId} className="grid gap-1 px-3 py-2 text-sm">
                  <Link href={`/painel/filiados/${p.filiadoId}`} className="font-medium underline-offset-4 hover:underline">
                    {p.nome ?? "(sem nome)"}
                  </Link>
                  <span className="text-muted-foreground">
                    {p.campos.map((c, i) => (
                      <span key={c.seq} className={desfeitos.has(c.seq) ? "line-through" : undefined}>
                        {i > 0 ? " · " : ""}
                        {ROTULOS_CAMPO[c.campo] ?? c.campo}: {exibirValor(c.campo, c.anterior)} → {exibirValor(c.campo, c.novo)}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
              {lista.length === 0 && <li className="text-muted-foreground px-3 py-2 text-sm">Nenhum campo gravado.</li>}
            </ul>
          </CardContent>
        </Card>
      )}

      {lote.naoEncontrados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Não encontrados no cadastro</CardTitle>
            <CardDescription>
              {lote.naoEncontrados.length} trabalhador(es) da lista sem cadastro correspondente (nem pelo CPF, nem
              pela matrícula{lote.fonteNome ? " na fonte" : ""}, nem pelo nome).
              {lote.situacao === "rascunho" ? " Depois de aplicar, você poderá cadastrá-los." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NaoEncontrados
              loteId={lote.id}
              fonteNome={lote.fonteNome}
              podeCadastrar={lote.situacao === "aplicado" && Boolean(lote.fonteId)}
              semFonte={!lote.fonteId && lote.situacao !== "desfeito"}
              itens={lote.naoEncontrados.map((n) => ({
                linha: n.linha,
                nome: n.nome,
                cpf: n.cpf,
                matricula: n.matricula,
                cargo: n.vinculo.cargo ?? null,
                cadastradoId: n.cadastradoId ?? null,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {lote.descartadas.length > 0 && (
        <GrupoColapsavel titulo={`Linhas descartadas (${lote.descartadas.length})`}>
          <ul className="divide-y rounded-lg border">
            {lote.descartadas.map((d) => (
              <li key={`${d.linha}-${d.motivo}`} className="flex flex-wrap gap-x-3 px-3 py-2 text-sm">
                <span className="text-muted-foreground">linha {d.linha}</span>
                <span className="font-medium">{d.nome ?? "(sem nome)"}</span>
                <Badge variant="outline">{d.motivo}</Badge>
              </li>
            ))}
          </ul>
        </GrupoColapsavel>
      )}
    </>
  )
}
