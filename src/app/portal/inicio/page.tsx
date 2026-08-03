import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  Newspaper,
  ShieldCheck,
  UserPen,
} from "lucide-react"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireSessaoPortal } from "@/lib/auth"
import { eventosDoAplicativo } from "@/lib/db/filiado-portal"
import { ultimasNoticias } from "@/lib/db/painel"
import { formatarDataHora } from "@/lib/formato"

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
  const { filiado } = await requireSessaoPortal()
  const nome = filiado.nome_completo ?? "Associado(a)"

  const [noticias, eventos] = await Promise.all([
    ultimasNoticias(5),
    eventosDoAplicativo(5),
  ])

  return (
    <PortalShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {nome.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Bem-vindo(a) ao portal do associado do Sindipetro-NF.
        </p>
      </div>

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
