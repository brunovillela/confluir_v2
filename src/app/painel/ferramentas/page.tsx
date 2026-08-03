import type { Metadata } from "next"
import {
  CalendarDays,
  FileText,
  FolderKanban,
  ListChecks,
  ScrollText,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Ferramentas administrativas — Confluir" }

type Area = {
  titulo: string
  descricao: string
  href: string | null
  icone: LucideIcon
  chave: string
  chavesAlternativas?: string[]
}

/**
 * Hub das ferramentas administrativas do sindicato. As áreas sem rota própria
 * ainda (`href: null`) aparecem como "Em breve" — serão implementadas nas
 * próximas entregas (ver memória do projeto).
 */
const AREAS: Area[] = [
  {
    titulo: "Projetos",
    descricao: "Projetos do sindicato, orçamento e gasto vinculado em Compras",
    href: "/painel/ferramentas/projetos",
    icone: FolderKanban,
    chave: "ferramentas_projetos",
    chavesAlternativas: ["ferramentas_projetos_edicao"],
  },
  {
    titulo: "Demandas, tarefas e anomalias",
    descricao: "Frentes de atuação, tarefas com responsável e não conformidades",
    href: "/painel/ferramentas/demandas",
    icone: ListChecks,
    chave: "ferramentas_demandas",
    chavesAlternativas: ["ferramentas_tarefas", "ferramentas_anomalias"],
  },
  {
    titulo: "Documentos",
    descricao: "Documentos institucionais com versionamento",
    href: "/painel/ferramentas/documentos",
    icone: FileText,
    chave: "ferramentas_documentos",
  },
  {
    titulo: "Agenda",
    descricao: "Eventos, reuniões e atividades do sindicato",
    href: "/painel/ferramentas/agenda",
    icone: CalendarDays,
    chave: "ferramentas_agendas",
  },
  {
    titulo: "Ofícios",
    descricao: "Emissão e histórico de ofícios com numeração por ano",
    href: "/painel/ferramentas/oficios",
    icone: ScrollText,
    chave: "ferramentas_oficios",
  },
]

export default async function FerramentasPage() {
  const sessao = await requirePermissao("ferramentas_projetos", [
    "ferramentas_projetos_edicao",
    "ferramentas_demandas",
    "ferramentas_tarefas",
    "ferramentas_anomalias",
    "ferramentas_documentos",
    "ferramentas_agendas",
    "ferramentas_oficios",
  ])

  const visiveis = AREAS.filter((a) =>
    podeAcessar(sessao.permissoes, a.chave, a.chavesAlternativas)
  )

  return (
    <>
      <div>
        <div className="flex items-center gap-2">
          <Wrench className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Ferramentas administrativas
          </h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Áreas de apoio à gestão do sindicato
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.map((area) => (
          <CartaoArea
            key={area.titulo}
            titulo={area.titulo}
            descricao={area.descricao}
            href={area.href}
            icone={area.icone}
            emBreve={!area.href}
          />
        ))}
      </div>
    </>
  )
}
