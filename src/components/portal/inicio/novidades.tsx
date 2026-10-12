import Link from "next/link"
import { Bell, Inbox, MessagesSquare } from "lucide-react"

import { EstadoVazio } from "@/components/portal/estado-vazio"
import { Indisponivel } from "@/components/portal/inicio/indisponivel"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Filiado } from "@/lib/contas"
import { avisosNaoLidos, respostasAguardando } from "@/lib/db/portal-inicio"
import { formatarDataHora } from "@/lib/formato"
import { EVENTOS_PORTAL } from "@/lib/portal-avisos-eventos"

import { tentar } from "./cargas"

const ROTULO = new Map<string, string>(EVENTOS_PORTAL.map((e) => [e.chave, e.rotulo]))

/** Quantos de cada um cabem no Início; o resto está em Avisos e em Atendimento. */
const MAX_RESPOSTAS = 3
const MAX_AVISOS = 5

/**
 * DD/MM/AAAA de um instante, no fuso de São Paulo. (formatarData lê o
 * começo da string e daria a data em UTC: a resposta das 22h viraria o dia
 * seguinte.)
 */
const DIA_SP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" })
function diaSP(instante: string): string {
  const d = new Date(instante)
  return Number.isNaN(d.getTime()) ? "—" : DIA_SP.format(d)
}

/** O caminho do link, sem consulta nem âncora — para reconhecer o mesmo item. */
function caminho(link: string): string {
  return link.split(/[?#]/)[0]
}

/**
 * Novidades para você (A33 + A96): o que a entidade respondeu e os avisos
 * ainda não lidos, sem precisar notar o selo do sino. As respostas da
 * entidade vêm em destaque — a vez é da pessoa. Ler esta lista NÃO marca os
 * avisos como lidos: quem marca é a página de Avisos, para o sino e o Início
 * contarem a mesma coisa (no "Ver como filiado", então, nada muda).
 */
export async function Novidades({ filiado }: { filiado: Filiado }) {
  const [rRespostas, rNaoLidos] = await Promise.all([
    tentar("atendimentos respondidos", () => respostasAguardando(filiado.cpf)),
    tentar("avisos não lidos", () => avisosNaoLidos(filiado.cpf, MAX_AVISOS + MAX_RESPOSTAS)),
  ])
  // Falhou: "Nada novo por aqui" seria mentira — o cartão diz que não carregou (A187).
  const falhou = !rRespostas || !rNaoLidos
  const respostas = rRespostas?.valor ?? []
  const naoLidos = rNaoLidos?.valor ?? { avisos: [], total: 0 }
  const destaques = respostas.slice(0, MAX_RESPOSTAS)
  // O aviso "a entidade respondeu" leva à mesma solicitação do destaque: uma vez basta.
  const jaEmDestaque = new Set(destaques.map((a) => `/portal/atendimento/${a.id}`))
  const avisos = naoLidos.avisos.filter((a) => !a.link || !jaEmDestaque.has(caminho(a.link))).slice(0, MAX_AVISOS)
  const vazio = destaques.length === 0 && avisos.length === 0
  const maisRespostas = respostas.length - destaques.length

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
          <Bell className="text-muted-foreground size-4" aria-hidden />
          Novidades para você
        </CardTitle>
        <CardAction>
          <Button variant="outline" asChild>
            <Link href="/portal/avisos">
              {naoLidos.total > avisos.length
                ? `Ver todos (${naoLidos.total} ${naoLidos.total === 1 ? "novo" : "novos"})`
                : "Ver todos os avisos"}
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {destaques.map((a) => (
          <Link
            key={a.id}
            href={`/portal/atendimento/${a.id}`}
            className="group border-primary/40 bg-primary/5 hover:bg-primary/10 focus-visible:border-ring focus-visible:ring-ring/50 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                <MessagesSquare className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">A entidade respondeu: {a.titulo}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {a.assuntoRotulo} · resposta em {diaSP(a.atualizadoEm)}
                </p>
              </div>
            </div>
            {/* Aparência de botão sem <button> dentro do <a>: o cartão inteiro é o
                link, com o foco visível no próprio cartão (A156). */}
            <span className={buttonVariants({ size: "sm" })}>Ler resposta</span>
          </Link>
        ))}
        {maisRespostas > 0 && (
          <Link
            href="/portal/atendimento"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
          >
            Mais {maisRespostas} {maisRespostas === 1 ? "resposta" : "respostas"} em Atendimento
          </Link>
        )}

        {avisos.length > 0 && (
          <ul className="divide-y">
            {avisos.map((a) => {
              const conteudo = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{a.texto}</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {ROTULO.get(a.evento) ?? "Aviso"} · {formatarDataHora(a.criadoEm)}
                    </span>
                  </span>
                  <Badge className="shrink-0">Novo</Badge>
                </>
              )
              const classes = "-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-3"
              return (
                <li key={a.id}>
                  {a.link ? (
                    <Link href={a.link} className={`${classes} hover:bg-muted/40 transition-colors`}>
                      {conteudo}
                    </Link>
                  ) : (
                    <div className={classes}>{conteudo}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {vazio && !falhou && <EstadoVazio compacto icone={Inbox} titulo="Nada novo por aqui." />}
        {falhou && (
          <Indisponivel className={vazio ? undefined : "text-xs"}>
            {vazio
              ? "Não foi possível carregar suas novidades agora. Tente de novo daqui a pouco."
              : "Parte das novidades não carregou agora."}
          </Indisponivel>
        )}
      </CardContent>
    </Card>
  )
}

export function EsqueletoNovidades() {
  return <Skeleton aria-hidden className="h-32 w-full rounded-xl" />
}
