import type { Metadata } from "next"
import Link from "next/link"
import {
  Car,
  CalendarClock,
  ClipboardCheck,
  FileWarning,
  Fuel,
  IdCard,
  Plus,
  ScrollText,
  TriangleAlert,
  Wrench,
} from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmUsoBadge } from "@/components/veiculos"
import { requirePermissao } from "@/lib/auth"
import { listarVeiculos, resumoVeiculos } from "@/lib/db/veiculos"
import { totalVencidos } from "@/lib/db/veiculos-checklist"
import { totalPreventivasVencidas } from "@/lib/db/veiculos-manutencoes"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Veículos — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = { busca?: string; situacao?: string }

export default async function VeiculosPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("veiculos", ["veiculos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")

  const brutos = await searchParams
  const situacao =
    brutos.situacao === "inativos" || brutos.situacao === "todos"
      ? brutos.situacao
      : "ativos"
  const busca = (brutos.busca ?? "").trim()

  const [resumo, veiculos, checklistsVencidos, preventivasVencidas] =
    await Promise.all([
      resumoVeiculos(),
      listarVeiculos({ busca, situacao }),
      totalVencidos(),
      totalPreventivasVencidas(),
    ])

  const hoje = new Date().toISOString().slice(0, 10)
  const alertas = [
    ...resumo.cnhsVencendo.map((c) => ({
      chave: `cnh-${c.id}`,
      texto: `CNH de ${c.usuarioNome ?? "condutor"} ${c.cnh_validade && c.cnh_validade < hoje ? "vencida" : "vence"} em ${formatarData(c.cnh_validade)}`,
      href: "/painel/veiculos/condutores",
    })),
    ...resumo.segurosVencendo.map((s) => ({
      chave: `seguro-${s.id}`,
      texto: `Seguro do veículo ${s.placa ?? ""} ${s.vencimento < hoje ? "venceu" : "vence"} em ${formatarData(s.vencimento)}`,
      href: `/painel/veiculos/${s.id}`,
    })),
    ...resumo.contratosVencendo.map((c) => ({
      chave: `contrato-${c.id}`,
      texto: `Contrato de aluguel ${c.numero ?? ""} (${c.fornecedorNome ?? ""}) termina em ${formatarData(c.vigencia_termino)}`,
      href: `/painel/veiculos/contratos/${c.id}`,
    })),
  ]

  const areasVeiculos = [
    {
      titulo: "Checklist da frota",
      descricao: "Verificação periódica dos veículos",
      href: "/painel/veiculos/checklists",
      icone: ClipboardCheck,
      indicador:
        checklistsVencidos > 0
          ? `${checklistsVencidos} vencido${checklistsVencidos === 1 ? "" : "s"}`
          : undefined,
    },
    {
      titulo: "Manutenções",
      descricao: "Prontuário da frota e preventivas programadas",
      href: "/painel/veiculos/manutencoes",
      icone: Wrench,
      indicador:
        preventivasVencidas > 0
          ? `${preventivasVencidas} vencida${preventivasVencidas === 1 ? "" : "s"}`
          : undefined,
    },
    {
      titulo: "Agendamentos",
      descricao: "Solicitações, retiradas e devoluções de veículos",
      href: "/painel/veiculos/agendamentos",
      icone: CalendarClock,
      indicador:
        (resumo.solicitacoesPendentes ?? 0) > 0
          ? `${resumo.solicitacoesPendentes} pendente${resumo.solicitacoesPendentes === 1 ? "" : "s"}`
          : undefined,
    },
    gestor && {
      titulo: "Abastecimentos",
      descricao: "Registros e importação de abastecimentos",
      href: "/painel/veiculos/abastecimentos",
      icone: Fuel,
    },
    {
      titulo: "Infrações",
      descricao: "Multas e cobrança dos infratores",
      href: "/painel/veiculos/infracoes",
      icone: FileWarning,
      indicador:
        (resumo.cobrancasPendentes ?? 0) > 0
          ? `${resumo.cobrancasPendentes} a cobrar`
          : undefined,
    },
    gestor && {
      titulo: "Condutores",
      descricao: "CNH e habilitação dos motoristas",
      href: "/painel/veiculos/condutores",
      icone: IdCard,
    },
    gestor && {
      titulo: "Contratos de aluguel",
      descricao: "Locações e mensalidades da frota",
      href: "/painel/veiculos/contratos",
      icone: ScrollText,
    },
  ].filter(Boolean) as {
    titulo: string
    descricao: string
    href: string
    icone: typeof CalendarClock
    indicador?: string
  }[]

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Veículos</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Frota, agendamentos, abastecimentos, infrações e contratos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/painel/veiculos/agendamentos">
              <CalendarClock />
              Solicitar veículo
            </Link>
          </Button>
          {gestor && (
            <Button asChild>
              <Link href="/painel/veiculos/novo">
                <Plus />
                Novo veículo
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areasVeiculos.map((a) => (
          <CartaoArea
            key={a.href}
            titulo={a.titulo}
            descricao={a.descricao}
            href={a.href}
            icone={a.icone}
            indicador={a.indicador}
          />
        ))}
      </div>

      {!resumo.disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Veículos ainda não configurados por completo — rode{" "}
            <code>supabase/veiculos.sql</code> no SQL Editor do Supabase para
            habilitar condutores, agendamentos e cobranças.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo rotulo="Frota ativa" valor={resumo.frotaAtiva} />
        <CardResumo rotulo="Em uso agora" valor={resumo.emUso ?? "—"} />
        <CardResumo
          rotulo="Solicitações pendentes"
          valor={resumo.solicitacoesPendentes ?? "—"}
          href="/painel/veiculos/agendamentos"
        />
        <CardResumo rotulo="Em manutenção" valor={resumo.emManutencao} />
      </div>

      {gestor && alertas.length > 0 && (
        <Card>
          <CardContent>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="text-warning-fg size-4" />
              Alertas dos próximos 30 dias
            </p>
            <ul className="grid gap-1.5">
              {alertas.map((a) => (
                <li key={a.chave} className="text-sm">
                  <Link href={a.href} className="hover:underline">
                    {a.texto}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/veiculos"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Placa, modelo ou código"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select name="situacao" defaultValue={situacao} className={SELECT_FILTRO}>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {veiculos.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Car className="mx-auto mb-2 size-5" />
              Nenhum veículo encontrado com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placa</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Cor</TableHead>
                  <TableHead>Lotação</TableHead>
                  <TableHead>Vínculo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Condutor atual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {veiculos.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <Link
                        href={`/painel/veiculos/${v.id}`}
                        className="text-primary font-medium whitespace-nowrap tabular-nums hover:underline"
                      >
                        {v.placa ?? "(sem placa)"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <span className="line-clamp-1">
                        {v.marca_modelo ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>{v.cor ?? "—"}</TableCell>
                    <TableCell>{v.lotacao ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap">
                        {v.eh_alugado ? "Alugado" : "Próprio"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {v.inativo ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inativo
                        </Badge>
                      ) : v.manutencao ? (
                        <Badge variant="outline" className="border-warning/40 text-warning-fg">
                          Manutenção
                        </Badge>
                      ) : (
                        <EmUsoBadge emUso={v.emUso} />
                      )}
                    </TableCell>
                    <TableCell>{v.condutorEmUsoNome ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function CardResumo({
  rotulo,
  valor,
  href,
}: {
  rotulo: string
  valor: number | string
  href?: string
}) {
  const conteudo = (
    <CardContent>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
      </p>
    </CardContent>
  )
  if (!href) return <Card>{conteudo}</Card>
  return (
    <Link href={href} className="group">
      <Card className="group-hover:border-primary/40 transition-colors">
        {conteudo}
      </Card>
    </Link>
  )
}
