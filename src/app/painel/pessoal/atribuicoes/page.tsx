import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  ListChecks,
  ShieldAlert,
  TriangleAlert,
  Users,
} from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterLimiarRotina, resumoSST } from "@/lib/db/pessoal-sst"
import { ROTULO_FREQUENCIA } from "@/lib/pessoal-sst-constantes"

import { LimiarForm } from "./limiar-form"

export const metadata: Metadata = { title: "Atribuições e SST — Confluir" }

type Icone = React.ComponentType<{ className?: string }>

function AlertaLink({
  href,
  texto,
  icone: IconeAlerta,
}: {
  href: string
  texto: string
  icone: Icone
}) {
  return (
    <Link href={href} className="group block">
      <div className="border-warning/40 group-hover:border-warning flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors">
        <IconeAlerta className="text-warning-fg size-4 shrink-0" />
        <p className="min-w-0 flex-1 text-sm">{texto}</p>
        <ArrowRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  )
}

export default async function AtribuicoesPage() {
  await requirePermissao("pessoal_gestao")
  const [r, limiar] = await Promise.all([resumoSST(), obterLimiarRotina()])

  const plural = (n: number, um: string, muitos: string) =>
    `${n} ${n === 1 ? um : muitos}`

  const alertas: { href: string; texto: string; icone: Icone }[] = []
  if (r.ativo && r.treinamentosPendentes > 0) {
    alertas.push({
      href: "/painel/pessoal/atribuicoes/matriz",
      icone: GraduationCap,
      texto: `${plural(r.treinamentosPendentes, "treinamento exigido pendente", "treinamentos exigidos pendentes")} (faltando ou vencido) em ${plural(r.funcionariosComPendencia, "funcionário", "funcionários")}.`,
    })
  }
  if (r.ativo && r.tarefasSemAvaliacao > 0) {
    alertas.push({
      href: "/painel/pessoal/atribuicoes/tarefas",
      icone: ShieldAlert,
      texto: `${plural(r.tarefasSemAvaliacao, "tarefa sem avaliação SST", "tarefas sem avaliação SST")} ou com avaliação vencida (mais de 12 meses).`,
    })
  }
  if (r.ativo && r.revalidacoesPendentes > 0) {
    alertas.push({
      href: "/painel/pessoal/atribuicoes/relatorios",
      icone: CalendarClock,
      texto: `${plural(r.revalidacoesPendentes, "atribuição precisa", "atribuições precisam")} de revalidação anual por funcionário.`,
    })
  }

  const cards: {
    href: string
    titulo: string
    indicador: string
    descricao: string
    icone: Icone
  }[] = [
    {
      href: "/painel/pessoal/atribuicoes/tarefas",
      titulo: "Tarefas",
      indicador: plural(r.tarefas, "tarefa", "tarefas"),
      descricao:
        "Catálogo de tarefas com recorrência, presença, ferramentas, perigos, riscos e medidas",
      icone: ListChecks,
    },
    {
      href: "/painel/pessoal/atribuicoes/funcoes",
      titulo: "Funções e plano de cargos",
      indicador: plural(r.funcoes, "função", "funções"),
      descricao:
        "Cargos, tarefas esperadas (plano de cargos) e funcionários de cada função",
      icone: Users,
    },
    {
      href: "/painel/pessoal/atribuicoes/matriz",
      titulo: "Matriz de treinamento",
      indicador:
        r.treinamentosPendentes > 0
          ? `${r.treinamentosPendentes} pendente${r.treinamentosPendentes === 1 ? "" : "s"}`
          : "Em dia",
      descricao: "Treinamentos exigidos por funcionário e seu status",
      icone: GraduationCap,
    },
    {
      href: "/painel/pessoal/atribuicoes/relatorios",
      titulo: "Relatórios",
      indicador: "Por funcionário, função e conjunto",
      descricao:
        "Presença física, tempo por tarefa, perigos e riscos — e revalidação anual",
      icone: ClipboardList,
    },
  ]

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Atribuições e SST
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Tarefas de cada funcionário, análise de perigos e riscos ocupacionais,
          matriz de treinamento e revalidação anual.
        </p>
      </div>

      {!r.ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            O schema desta área ainda não foi criado — rode{" "}
            <code>supabase/pessoal-atribuicoes-sst.sql</code> no SQL Editor do
            Supabase para ativar.
          </AlertDescription>
        </Alert>
      )}

      {alertas.length > 0 && (
        <section aria-label="Pendências">
          <div className="mb-2 flex items-center gap-2">
            <TriangleAlert className="text-warning-fg size-4" />
            <h2 className="text-sm font-medium">Precisa de atenção</h2>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {alertas.map((a) => (
              <AlertaLink key={a.texto} {...a} />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Áreas">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <CartaoArea key={c.href} {...c} />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Classificação de recorrência
          </CardTitle>
          <CardDescription>
            Regra que sugere se uma tarefa é <strong>rotineira</strong> ou{" "}
            <strong>não rotineira</strong> a partir da frequência declarada.
            Tarefas com frequência a partir de{" "}
            <strong>{ROTULO_FREQUENCIA[limiar] ?? limiar}</strong> são sugeridas
            como rotineiras. O gestor pode sobrepor em cada tarefa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LimiarForm atual={limiar} />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        <BriefcaseBusiness className="mr-1 inline size-3.5 align-[-2px]" />
        Preenchimento restrito à gestão de pessoal. A IA ajuda a montar o plano
        de cargos e a análise de perigos, riscos e medidas de cada tarefa.
      </p>
    </>
  )
}
