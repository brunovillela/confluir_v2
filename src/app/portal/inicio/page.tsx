import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  BedDouble,
  CalendarClock,
  CalendarDays,
  FileSignature,
  HandCoins,
  Newspaper,
  ShieldCheck,
  UserPen,
  Vote,
} from "lucide-react"

import { ContagemRegressiva } from "@/components/portal/contagem-regressiva"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
import { eventosDoAplicativo } from "@/lib/db/filiado-portal"
import { oposicoesParaFiliado } from "@/lib/db/oposicao"
import { ultimasNoticias } from "@/lib/db/painel"
import { assembleiasDoFiliado } from "@/lib/db/votacao-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { PortalShell } from "../portal-shell"

export const metadata: Metadata = {
  title: "Portal do Associado — Confluir",
}

const SERVICOS = [
  {
    titulo: "Meu cadastro",
    descricao: "Confira seus dados e atualize telefones, emails e endereço",
    href: "/portal/cadastro",
    icone: UserPen,
  },
  {
    titulo: "Hospedagem",
    descricao: "Solicite cupons de hospedagem subsidiada nos hotéis parceiros",
    href: "/portal/hospedagem",
    icone: BedDouble,
  },
  {
    titulo: "Notícias",
    descricao: "Últimas notícias do sindicato",
    href: "/portal/noticias",
    icone: Newspaper,
  },
  {
    titulo: "Votação",
    descricao: "Assembleias abertas e o histórico das suas participações",
    href: "/portal/votacao",
    icone: Vote,
  },
  {
    titulo: "Agenda",
    descricao: "Eventos e atividades abertas aos associados",
    href: "/portal/agenda",
    icone: CalendarDays,
  },
  {
    titulo: "LGPD",
    descricao: "Seus aceites e direitos sobre dados pessoais",
    href: "/portal/lgpd",
    icone: ShieldCheck,
  },
]

export default async function PortalInicioPage() {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const nome = filiado.nome_completo ?? "Associado(a)"

  const [noticias, eventos, assembleias, oposicoes] = await Promise.all([
    ultimasNoticias(5),
    eventosDoAplicativo(5),
    filiado.ativo ? assembleiasDoFiliado(filiado.cpf) : Promise.resolve([]),
    filiado.cpf ? oposicoesParaFiliado(filiado.cpf) : Promise.resolve([]),
  ])

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {nome.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Bem-vindo(a) ao portal do associado do Sindipetro-NF.
        </p>
      </div>

      {assembleias.length > 0 && (
        <div className="grid gap-3">
          {assembleias.map((a) => (
            <Link
              key={a.assembleiaId}
              href={
                !a.online && a.rodadaId
                  ? `/portal/votacao/rodada/${a.rodadaId}`
                  : "/portal/votacao"
              }
              className="group border-primary/40 bg-primary/5 hover:bg-primary/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition-colors"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                  {a.online ? (
                    <Vote className="size-5" />
                  ) : (
                    <CalendarClock className="size-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {a.online
                      ? a.jaVotou
                        ? "Você já votou nesta assembleia"
                        : "Assembleia aberta para votação"
                      : "Assembleia presencial — confira as datas"}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {a.nome ?? a.tema ?? "Assembleia"}
                    {a.empregador && <> · {a.empregador}</>}
                    {" · "}
                    {a.online ? (
                      a.termino ? (
                        <ContagemRegressiva ate={a.termino} />
                      ) : (
                        ROTULOS_MODALIDADE[a.modalidade]
                      )
                    ) : a.inicio ? (
                      <>a partir de {formatarData(a.inicio)}</>
                    ) : (
                      "confira as datas"
                    )}
                  </p>
                </div>
              </div>
              {a.online && !a.jaVotou ? (
                <Button size="sm" className="pointer-events-none">
                  <Vote />
                  Votar
                </Button>
              ) : (
                <ArrowRight className="text-muted-foreground size-4" />
              )}
            </Link>
          ))}
        </div>
      )}

      {oposicoes.length > 0 && (
        <div className="grid gap-3">
          {oposicoes.map((o) => (
            <Link
              key={o.campanhaId}
              href={
                o.pendenteDocumento && o.opositorId
                  ? `/portal/oposicao/comprovante/${o.opositorId}`
                  : `/portal/oposicao/${o.campanhaId}`
              }
              className="group border-primary/40 bg-primary/5 hover:bg-primary/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition-colors"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                  {o.pendenteDocumento ? (
                    <FileSignature className="size-5" />
                  ) : (
                    <HandCoins className="size-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {o.pendenteDocumento
                      ? "Falta enviar sua carta assinada"
                      : "Oposição à contribuição aberta"}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {o.nome ?? "Contribuição assistencial"}
                    {o.detalhe && <> · {o.detalhe}</>}
                    {o.prazoFim && (
                      <>
                        {" · "}
                        <ContagemRegressiva ate={`${o.prazoFim}T23:59:59`} />
                      </>
                    )}
                  </p>
                </div>
              </div>
              <Button size="sm" className="pointer-events-none">
                {o.pendenteDocumento ? (
                  <>
                    <FileSignature />
                    Enviar carta
                  </>
                ) : (
                  <>
                    <HandCoins />
                    Opor-me
                  </>
                )}
              </Button>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICOS.map((servico) => (
          <Link key={servico.href} href={servico.href} className="group">
            <Card className="hover:border-primary/40 h-full transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="bg-muted flex size-9 items-center justify-center rounded-lg">
                    <servico.icone className="size-4.5" />
                  </div>
                  <ArrowRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <CardTitle className="pt-2 text-base">{servico.titulo}</CardTitle>
                <CardDescription>{servico.descricao}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {noticias.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Últimas notícias</CardTitle>
            </CardHeader>
            <ul className="grid gap-1 px-6 pb-5">
              {noticias.map((n, i) => (
                <li key={n.id ?? n.url ?? i}>
                  {n.id ? (
                    <Link
                      href={`/portal/noticias/${n.id}`}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      {n.titulo}
                    </Link>
                  ) : (
                    <a
                      href={n.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      {n.titulo}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {eventos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Próximos eventos</CardTitle>
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
        )}
      </div>
    </PortalShell>
  )
}
