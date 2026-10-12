import Link from "next/link"
import { CalendarDays, ExternalLink, Newspaper, Sparkles, Vote } from "lucide-react"

import { EstadoVazio } from "@/components/portal/estado-vazio"
import { Indisponivel } from "@/components/portal/inicio/indisponivel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { eventosDoAplicativo } from "@/lib/db/filiado-portal"
import { dataDaNoticia } from "@/lib/db/noticias"
import { ultimasNoticias, type Noticia } from "@/lib/db/painel"
import { noPrazo } from "@/lib/db/portal-inicio"
import { ROTULO_CANAL } from "@/lib/db/voto-comprovante"
import { minhasVotacoes } from "@/lib/db/votacao-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { eventosDaPessoa, tentar } from "./cargas"

/**
 * Os blocos do fim do Início, na seção "Notícias e atividades" (notícias,
 * inscrições, votações e agenda). Cada um é um componente com o seu Suspense
 * na página (A69): o que demora ou falha não segura nem derruba o resto — e
 * não some calado (A187): diz que não carregou.
 *
 * Notícias e agenda aparecem sempre, com o estado vazio de uma linha e o
 * link para a seção (A145): o cartão nunca é beco sem saída. Inscrições
 * abertas e últimas votações só quando há o que mostrar.
 *
 * Os títulos são h3: o h2 é o da seção, na página.
 */

/**
 * Prazo das notícias. Com a tabela `noticias` vazia, ultimasNoticias busca o
 * site da entidade sem prazo próprio; um site lento não pode segurar o bloco.
 */
const PRAZO_NOTICIAS_MS = 4000

/** Link que ocupa a linha: 44 px no toque, foco visível. */
const ITEM_LINK =
  "group focus-visible:ring-ring/50 -mx-2 block rounded-md px-2 py-1.5 outline-none focus-visible:ring-3 pointer-coarse:min-h-11"

/** Botão do pé do cartão ("Ver todas…"). */
function Rodape({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div>
      <Button asChild variant="outline">
        <Link href={href}>{children}</Link>
      </Button>
    </div>
  )
}

export async function CartaoNoticias() {
  // null = falhou ou passou do prazo (o site da entidade não respondeu a tempo).
  const r = await tentar("notícias", () =>
    noPrazo<Noticia[] | null>("notícias", ultimasNoticias(5), PRAZO_NOTICIAS_MS, null)
  )
  const noticias = r?.valor ?? null
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={3} className="flex items-center gap-2">
          <Newspaper className="text-muted-foreground size-4" aria-hidden />
          Últimas notícias
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {noticias === null ? (
          <Indisponivel />
        ) : noticias.length === 0 ? (
          <EstadoVazio compacto icone={Newspaper} titulo="Nenhuma notícia publicada ainda." />
        ) : (
          <ul className="grid gap-1">
            {noticias.map((n, i) => {
              // Com ano (A182): `quando` é a data completa; `data` (DD/MM) só na falta dela.
              // No dia de São Paulo, como a página de Notícias: formatarData lê o
              // dia UTC do instante, e a notícia das 22h sairia com o dia seguinte.
              const data = dataDaNoticia(n.quando) ?? n.data
              const conteudo = (
                <>
                  <span className="block text-sm underline-offset-4 group-hover:underline">
                    {n.titulo}
                    {!n.id && (
                      <>
                        <ExternalLink className="text-muted-foreground ml-1 inline size-3.5 align-[-2px]" aria-hidden />
                        <span className="sr-only"> (abre o site da entidade em outra aba)</span>
                      </>
                    )}
                  </span>
                  {data && (
                    <time dateTime={n.quando ?? undefined} className="text-muted-foreground block text-xs">
                      {data}
                    </time>
                  )}
                </>
              )
              return (
                <li key={n.id ?? n.url ?? i}>
                  {n.id ? (
                    <Link href={`/portal/noticias/${n.id}`} className={ITEM_LINK}>
                      {conteudo}
                    </Link>
                  ) : (
                    <a href={n.url ?? "/portal/noticias"} target="_blank" rel="noreferrer" className={ITEM_LINK}>
                      {conteudo}
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <Rodape href="/portal/noticias">Ver todas as notícias</Rodape>
      </CardContent>
    </Card>
  )
}

/**
 * Inscrições abertas: um cartão comum, com o ícone no título (A146) — o
 * fundo laranja fica para o que pede ação da pessoa ("Para você resolver").
 */
export async function CartaoInscricoesAbertas({ cpf }: { cpf: string }) {
  const r = await tentar("inscrições abertas", async () => (await eventosDaPessoa(cpf)).filter((e) => e.aberta && !e.inscrito))
  if (r && r.valor.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={3} className="flex items-center gap-2">
          <Sparkles className="text-primary size-4" aria-hidden />
          Inscrições abertas
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {r === null ? (
          <Indisponivel />
        ) : (
          <ul className="grid gap-2">
            {r.valor.slice(0, 3).map((e) => (
              <li key={e.evento.id} className="text-sm">
                <span className="font-medium">{e.evento.titulo ?? "(sem título)"}</span>
                <span className="text-muted-foreground block text-xs">
                  {formatarDataHora(e.evento.inicio)}
                  {e.evento.local ? ` · ${e.evento.local}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Rodape href="/portal/eventos">{r === null ? "Ver eventos" : "Ver e inscrever-se"}</Rodape>
      </CardContent>
    </Card>
  )
}

export async function CartaoVotacoes({ cpf }: { cpf: string }) {
  const r = await tentar("votações", async () => (await minhasVotacoes(cpf)).slice(0, 3))
  if (r && r.valor.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={3} className="flex items-center gap-2">
          <Vote className="text-muted-foreground size-4" aria-hidden />
          Suas últimas votações
        </CardTitle>
        <CardDescription>Participação registrada — o sistema nunca mostra em quem você votou.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {r === null ? (
          <Indisponivel />
        ) : (
          <ul className="grid gap-2">
            {r.valor.map((v) => (
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
                      className="text-foreground font-mono tracking-wider underline underline-offset-2 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                    >
                      {v.comprovante.codigo}
                    </Link>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <Rodape href="/portal/votacao">Ver todas as votações</Rodape>
      </CardContent>
    </Card>
  )
}

export async function CartaoAgenda() {
  const r = await tentar("agenda", () => eventosDoAplicativo(5))
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={3} className="flex items-center gap-2">
          <CalendarDays className="text-muted-foreground size-4" aria-hidden />
          Agenda de atividades
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {r === null ? (
          <Indisponivel />
        ) : r.valor.length === 0 ? (
          <EstadoVazio compacto icone={CalendarDays} titulo="Nenhuma atividade programada por enquanto." />
        ) : (
          <ul className="grid gap-2">
            {r.valor.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="font-medium">{e.atividade ?? "(sem título)"}</span>
                <span className="text-muted-foreground block text-xs">
                  {e.dia_todo ? formatarData(e.inicio) : formatarDataHora(e.inicio)}
                  {e.local ? ` · ${e.local}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* A agenda mora em Eventos, na seção com id="agenda". */}
        <Rodape href="/portal/eventos#agenda">Ver agenda completa</Rodape>
      </CardContent>
    </Card>
  )
}

/** Lugar de um cartão enquanto carrega. */
export function EsqueletoCartao() {
  return <Skeleton aria-hidden className="h-40 w-full rounded-xl" />
}
