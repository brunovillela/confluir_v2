import Link from "next/link"
import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { eventosParaFiliado } from "@/lib/db/eventos-portal"
import { eventosDoAplicativo } from "@/lib/db/filiado-portal"
import { ultimasNoticias } from "@/lib/db/painel"
import { noPrazo, seguro } from "@/lib/db/portal-inicio"
import { ROTULO_CANAL } from "@/lib/db/voto-comprovante"
import { minhasVotacoes } from "@/lib/db/votacao-portal"
import { formatarDataHora } from "@/lib/formato"
import { tenantAtual } from "@/lib/tenant"

/**
 * Os blocos do fim do Início (notícias, inscrições, votações e agenda). Cada
 * um é um componente com o seu Suspense na página (A69): o que demora ou
 * falha some sozinho, sem segurar nem derrubar o resto.
 */

/**
 * Prazo das notícias. Com a tabela `noticias` vazia, ultimasNoticias busca o
 * site da entidade sem prazo próprio; um site lento não pode segurar o bloco.
 */
const PRAZO_NOTICIAS_MS = 4000

export async function CartaoNoticias() {
  const noticias = await seguro("notícias", () => noPrazo("notícias", ultimasNoticias(5), PRAZO_NOTICIAS_MS, []), [])
  if (noticias.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="text-base">
          Últimas notícias
        </CardTitle>
      </CardHeader>
      <ul className="grid gap-1 px-6 pb-5">
        {noticias.map((n, i) => (
          <li key={n.id ?? n.url ?? i}>
            {n.id ? (
              <Link href={`/portal/noticias/${n.id}`} className="text-sm underline-offset-4 hover:underline">
                {n.titulo}
              </Link>
            ) : (
              <a href={n.url ?? "#"} target="_blank" rel="noreferrer" className="text-sm underline-offset-4 hover:underline">
                {n.titulo}
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

export async function CartaoInscricoesAbertas({ cpf }: { cpf: string }) {
  const abertas = await seguro(
    "inscrições abertas",
    async () => (await eventosParaFiliado(cpf, await tenantAtual())).filter((e) => e.aberta && !e.inscrito),
    []
  )
  if (abertas.length === 0) return null
  return (
    <Card className="border-primary/50 bg-primary/5 ring-primary/20 ring-1">
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-base">
          <Sparkles className="text-primary size-4" />
          Inscrições abertas
        </CardTitle>
      </CardHeader>
      <ul className="grid gap-2 px-6 pb-5">
        {abertas.slice(0, 3).map((e) => (
          <li key={e.evento.id} className="text-sm">
            <span className="font-medium">{e.evento.titulo ?? "(sem título)"}</span>
            <span className="text-muted-foreground block text-xs">
              {formatarDataHora(e.evento.inicio)}
              {e.evento.local ? ` · ${e.evento.local}` : ""}
            </span>
          </li>
        ))}
        <li>
          <Button asChild>
            <Link href="/portal/eventos">Ver e inscrever-se</Link>
          </Button>
        </li>
      </ul>
    </Card>
  )
}

export async function CartaoVotacoes({ cpf }: { cpf: string }) {
  const votacoes = await seguro("votações", async () => (await minhasVotacoes(cpf)).slice(0, 3), [])
  if (votacoes.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="text-base">
          Suas últimas votações
        </CardTitle>
        <CardDescription>Participação registrada — o sistema nunca mostra em quem você votou.</CardDescription>
      </CardHeader>
      <ul className="grid gap-2 px-6 pb-5">
        {votacoes.map((v) => (
          <li key={v.assembleiaId} className="text-sm">
            <span className="font-medium">{v.nome ?? v.tema ?? "Assembleia"}</span>
            <span className="text-muted-foreground block text-xs">
              {v.quando ? `Voto computado em ${formatarDataHora(v.quando)}` : "Participação registrada"}
              {v.comprovante ? ` · ${ROTULO_CANAL[v.comprovante.canal]}` : ""}
            </span>
            {v.comprovante && (
              <span className="text-muted-foreground block text-xs">
                Comprovante{" "}
                <Link
                  href={`/comprovante/${v.comprovante.codigo}`}
                  className="text-foreground font-mono tracking-wider underline underline-offset-2"
                >
                  {v.comprovante.codigo}
                </Link>
              </span>
            )}
          </li>
        ))}
        <li>
          <Button asChild variant="outline">
            <Link href="/portal/votacao">Ver todas as votações</Link>
          </Button>
        </li>
      </ul>
    </Card>
  )
}

export async function CartaoAgenda() {
  const eventos = await seguro("agenda", () => eventosDoAplicativo(5), [])
  if (eventos.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="text-base">
          Agenda de atividades
        </CardTitle>
      </CardHeader>
      <ul className="grid gap-2 px-6 pb-5">
        {eventos.map((e) => (
          <li key={e.id} className="text-sm">
            <span className="font-medium">{e.atividade ?? "(sem título)"}</span>
            <span className="text-muted-foreground block text-xs">
              {formatarDataHora(e.inicio)}
              {e.local ? ` · ${e.local}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Lugar de um cartão enquanto carrega. */
export function EsqueletoCartao() {
  return <Skeleton aria-hidden className="h-40 w-full rounded-xl" />
}
