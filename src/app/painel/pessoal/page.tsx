import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Award,
  BriefcaseBusiness,
  Clock4,
  FileBadge,
  GraduationCap,
  HandCoins,
  HeartPulse,
  ReceiptText,
  Stethoscope,
  TreePalm,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"
import { resumoPessoal } from "@/lib/db/pessoal-dashboard"

export const metadata: Metadata = { title: "Pessoal — Confluir" }

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

function AreaCard({
  href,
  titulo,
  indicador,
  descricao,
  icone,
}: {
  href: string
  titulo: string
  indicador: string
  descricao: string
  icone: Icone
}) {
  return (
    <CartaoArea
      href={href}
      titulo={titulo}
      descricao={descricao}
      indicador={indicador}
      icone={icone}
    />
  )
}

export default async function PessoalPage() {
  const sessao = await requirePermissao("pessoal_gestao", [
    "pessoal_contracheque",
    "pessoal_anuenios",
    "pessoal_niveis_salariais",
    "pessoal_diarias",
    "pessoal_aso",
    "pessoal_informes_rendimentos",
  ])
  const veGestao = sessao.permissoes["pessoal_gestao"] === true
  const ve = (chave: string) =>
    veGestao || sessao.permissoes[chave] === true

  const r = await resumoPessoal()

  const plural = (n: number, um: string, muitos: string) =>
    `${n} ${n === 1 ? um : muitos}`

  // Alertas acionáveis — só aparecem com pendência E permissão na área.
  const alertas: { href: string; texto: string; icone: Icone }[] = []
  if (veGestao && (r.diariasAguardando ?? 0) > 0) {
    alertas.push({
      href: "/painel/pessoal/diarias",
      icone: HandCoins,
      texto: `${plural(r.diariasAguardando!, "diária aguarda", "diárias aguardam")} avaliação.`,
    })
  }
  if (veGestao && (r.reembolsosAguardando ?? 0) > 0) {
    alertas.push({
      href: "/painel/pessoal/reembolsos",
      icone: ReceiptText,
      texto: `${plural(r.reembolsosAguardando!, "reembolso do ACT aguarda", "reembolsos do ACT aguardam")} avaliação.`,
    })
  }
  if (veGestao && (r.reembolsosAPagar ?? 0) > 0) {
    alertas.push({
      href: "/painel/pessoal/reembolsos",
      icone: ReceiptText,
      texto: `${plural(r.reembolsosAPagar!, "reembolso aprovado", "reembolsos aprovados")} a lançar no contracheque.`,
    })
  }
  if (veGestao && r.gozosAguardando > 0) {
    alertas.push({
      href: "/painel/pessoal/ferias",
      icone: TreePalm,
      texto: `${plural(r.gozosAguardando, "gozo de férias aguarda", "gozos de férias aguardam")} autorização.`,
    })
  }
  if (veGestao && r.feriasVencendo120 > 0) {
    alertas.push({
      href: "/painel/pessoal/ferias",
      icone: TreePalm,
      texto: `${plural(r.feriasVencendo120, "período de férias em aberto", "períodos de férias em aberto")} com 120 dias ou menos para o fim do concessivo.`,
    })
  }
  if (ve("pessoal_anuenios") && r.anuenios30 > 0) {
    alertas.push({
      href: "/painel/pessoal/anuenios",
      icone: Award,
      texto: `${plural(r.anuenios30, "anuênio avança", "anuênios avançam")} nos próximos 30 dias.`,
    })
  }
  if (ve("pessoal_niveis_salariais") && r.niveis30 > 0) {
    alertas.push({
      href: "/painel/pessoal/niveis",
      icone: TrendingUp,
      texto: `${plural(r.niveis30, "nível salarial com avanço previsto", "níveis salariais com avanço previsto")} nos próximos 30 dias.`,
    })
  }
  if (ve("pessoal_aso") && r.asoVencendo90 > 0) {
    alertas.push({
      href: "/painel/pessoal/aso",
      icone: HeartPulse,
      texto: `${plural(r.asoVencendo90, "ASO vigente vencido ou vencendo", "ASOs vigentes vencidos ou vencendo")} nos próximos 90 dias.`,
    })
  }
  if (veGestao && r.certificadosVencidos > 0) {
    alertas.push({
      href: "/painel/pessoal/treinamentos",
      icone: GraduationCap,
      texto: `${plural(r.certificadosVencidos, "certificado de treinamento vencido", "certificados de treinamento vencidos")}.`,
    })
  }
  if (veGestao && r.ausentesHoje > 0) {
    alertas.push({
      href: "/painel/pessoal/atestados?aba=ausencias",
      icone: Stethoscope,
      texto: `${plural(r.ausentesHoje, "funcionário ausente", "funcionários ausentes")} hoje.`,
    })
  }

  // Cards de área — cada um com o indicador mais útil da área.
  const areas: {
    mostrar: boolean
    href: string
    titulo: string
    indicador: string
    descricao: string
    icone: Icone
  }[] = [
    {
      mostrar: veGestao || ve("pessoal_contracheque"),
      href: "/painel/pessoal/funcionarios",
      titulo: "Funcionários",
      indicador: plural(r.funcionariosAtivos, "ativo", "ativos"),
      descricao: "Cadastro, vínculos e perfil completo",
      icone: Users,
    },
    {
      mostrar: veGestao || ve("pessoal_contracheque"),
      href: "/painel/pessoal/contracheques",
      titulo: "Contracheques",
      indicador: plural(
        r.remessasContrachequesAbertas,
        "remessa aberta",
        "remessas abertas"
      ),
      descricao: "Remessas mensais, 13º, férias e adiantamentos",
      icone: ReceiptText,
    },
    {
      mostrar: veGestao,
      href: "/painel/pessoal/ponto",
      titulo: "Controle de ponto",
      indicador: plural(
        r.remessasPontoAbertas,
        "remessa aberta",
        "remessas abertas"
      ),
      descricao: "Espelhos de ponto e horas 70%/100%",
      icone: Clock4,
    },
    {
      mostrar: veGestao,
      href: "/painel/pessoal/ferias",
      titulo: "Férias",
      indicador: plural(r.feriasAbertas, "período em aberto", "períodos em aberto"),
      descricao: "Períodos, gozos e autorizações (regras CLT)",
      icone: TreePalm,
    },
    {
      mostrar: ve("pessoal_anuenios"),
      href: "/painel/pessoal/anuenios",
      titulo: "Anuênios",
      indicador:
        r.anuenios30 > 0
          ? `${r.anuenios30} em 30 dias`
          : plural(r.anueniosTotal, "lançamento", "lançamentos"),
      descricao: "Alíquota por ano de casa sobre o salário básico",
      icone: Award,
    },
    {
      mostrar: ve("pessoal_niveis_salariais"),
      href: "/painel/pessoal/niveis",
      titulo: "Níveis salariais",
      indicador:
        r.niveis30 > 0
          ? `${r.niveis30} em 30 dias`
          : plural(r.niveisTotal, "lançamento", "lançamentos"),
      descricao: "Degraus do acordo coletivo e reajuste",
      icone: TrendingUp,
    },
    {
      mostrar: ve("pessoal_diarias"),
      href: "/painel/pessoal/diarias",
      titulo: "Diárias",
      indicador:
        r.diariasAguardando === null
          ? "Configurar"
          : plural(r.diariasAguardando, "aguardando", "aguardando"),
      descricao:
        r.diariasAguardando === null
          ? "Rode supabase/diarias.sql para ativar"
          : "Solicitações pagas por ordem direta",
      icone: HandCoins,
    },
    {
      mostrar: veGestao,
      href: "/painel/pessoal/reembolsos",
      titulo: "Reembolsos do ACT",
      indicador:
        r.reembolsosAguardando === null
          ? "Configurar"
          : plural(r.reembolsosAguardando, "aguardando", "aguardando"),
      descricao:
        r.reembolsosAguardando === null
          ? "Rode supabase/reembolsos-act.sql para ativar"
          : "Benefícios do acordo pagos no contracheque",
      icone: ReceiptText,
    },
    {
      mostrar: veGestao,
      href: "/painel/pessoal/atestados",
      titulo: "Atestados e ausências",
      indicador:
        r.ausentesHoje > 0
          ? plural(r.ausentesHoje, "ausente hoje", "ausentes hoje")
          : plural(r.atestadosTotal, "atestado", "atestados"),
      descricao: "Registros de saúde e afastamentos",
      icone: Stethoscope,
    },
    {
      mostrar: ve("pessoal_aso"),
      href: "/painel/pessoal/aso",
      titulo: "ASOs",
      indicador:
        r.asoVencendo90 > 0
          ? `${r.asoVencendo90} a vencer`
          : plural(r.asosTotal, "registro", "registros"),
      descricao: "Atestados de saúde ocupacional (NR-7)",
      icone: HeartPulse,
    },
    {
      mostrar: veGestao,
      href: "/painel/pessoal/treinamentos",
      titulo: "Treinamentos",
      indicador:
        r.certificadosVencidos > 0
          ? `${r.certificadosVencidos} vencido${r.certificadosVencidos === 1 ? "" : "s"}`
          : plural(r.treinamentosTotal, "treinamento", "treinamentos"),
      descricao: "Catálogo, alunos e certificados",
      icone: GraduationCap,
    },
    {
      mostrar: ve("pessoal_informes_rendimentos"),
      href: "/painel/pessoal/informes",
      titulo: "Informes de rendimentos",
      indicador: plural(
        r.informesRemessasAbertas,
        "remessa aberta",
        "remessas abertas"
      ),
      descricao: "Remessas anuais para o imposto de renda",
      icone: FileBadge,
    },
  ]

  const visiveis = areas.filter((a) => a.mostrar)

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pessoal</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {r.funcionariosAtivos.toLocaleString("pt-BR")} funcionário
          {r.funcionariosAtivos === 1 ? "" : "s"} ativo
          {r.funcionariosAtivos === 1 ? "" : "s"} — visão geral das áreas do
          departamento
        </p>
      </div>

      {alertas.length > 0 && (
        <section aria-label="Pendências">
          <div className="mb-2 flex items-center gap-2">
            <TriangleAlert className="text-warning-fg size-4" />
            <h2 className="text-sm font-medium">Precisa de atenção</h2>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {alertas.map((a) => (
              <AlertaLink
                key={`${a.href}-${a.texto}`}
                href={a.href}
                texto={a.texto}
                icone={a.icone}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Áreas do Pessoal">
        <h2 className="mb-2 text-sm font-medium">Áreas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiveis.map((a) => (
            <AreaCard
              key={a.href}
              href={a.href}
              titulo={a.titulo}
              indicador={a.indicador}
              descricao={a.descricao}
              icone={a.icone}
            />
          ))}
        </div>
      </section>

      <p className="text-muted-foreground text-xs">
        <BriefcaseBusiness className="mr-1 inline size-3.5 align-[-2px]" />
        Autosserviço do funcionário: contracheques, ponto, carreira, férias,
        ASOs, treinamentos e informes ficam em{" "}
        <Link
          href="/painel/perfil/contracheques"
          className="text-primary hover:underline"
        >
          Meus contracheques e ponto
        </Link>
        {" · "}
        <Link
          href="/painel/perfil/diarias"
          className="text-primary hover:underline"
        >
          Minhas diárias
        </Link>
        {" · "}
        <Link
          href="/painel/perfil/reembolsos"
          className="text-primary hover:underline"
        >
          Meus reembolsos
        </Link>
        .
      </p>
    </>
  )
}
