import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Handshake, Pencil, Receipt, Users } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { acordosDoEmpregador, type AcordoDoEmpregador } from "@/lib/db/empregador-painel"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { gruposPorFonte, obterGrupo } from "@/lib/db/grupos-empresariais"
import { resumoReunioes } from "@/lib/db/representacao-reunioes"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"

import {
  AdicionarEmpregador,
  AdicionarEmpresaExterna,
  ExcluirGrupo,
  GrupoForm,
  RemoverMembro,
} from "../grupo-forms"

export const metadata: Metadata = { title: "Grupo empresarial — Confluir" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BASE = "/painel/representacao/empregadores"

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="grid content-start gap-1">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="text-xl leading-none font-semibold tabular-nums">{valor}</p>
      {detalhe && <p className="text-muted-foreground text-xs">{detalhe}</p>}
    </div>
  )
}

export default async function GrupoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string; criado?: string; avisos?: string }>
}) {
  await requirePermissao("empregadores")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const sp = await searchParams
  const grupo = await obterGrupo(id)
  if (!grupo) notFound()

  const representadas = grupo.membros.filter((m) => m.empresaId)
  const [fontes, porFonte, acordosPorEmpresa, reunioes] = await Promise.all([
    listarFontesPagadoras(),
    gruposPorFonte(),
    Promise.all(representadas.map((m) => acordosDoEmpregador(m.empresaId!))),
    Promise.all(representadas.map((m) => resumoReunioes(m.empresaId!))),
  ])

  // Acordos das empresas do grupo, sem repetir o acordo que cobre várias.
  const acordos = new Map<string, AcordoDoEmpregador & { empresas: string[] }>()
  acordosPorEmpresa.forEach((lista, k) => {
    for (const a of lista) {
      const atual = acordos.get(a.id) ?? { ...a, empresas: [] }
      atual.empresas.push(representadas[k].nome)
      acordos.set(a.id, atual)
    }
  })
  const vigentes = [...acordos.values()]
    .filter((a) => a.situacao === "vigente")
    .sort((a, b) => (b.vigenciaFim ?? "").localeCompare(a.vigenciaFim ?? ""))
  const reunioes12m = reunioes.reduce((s, r) => s + (r.disponivel ? r.reunioes12m : 0), 0)

  const livres = fontes
    .filter((f) => f.inativa !== true && !porFonte.has(f.id))
    .map((f) => ({ id: f.id, nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  const pagadora = grupo.membros.find((m) => m.empresaId && m.empresaId === grupo.empresaPagadoraId)

  return (
    <>
      <RotuloTrilha valores={{ [id]: grupo.nome }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`${BASE}/grupos`}>
            <ArrowLeft />
            Grupos empresariais
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{grupo.nome}</h1>
              {grupo.contribuicaoCentralizada && <Badge variant="info">Contribuição centralizada</Badge>}
            </div>
            {grupo.descricao && <p className="text-muted-foreground mt-1 text-sm">{grupo.descricao}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/painel/filiados/lista?grupo=${grupo.id}`}>
                <Users />
                Filiados do grupo
              </Link>
            </Button>
            {sp.editar !== "1" && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${BASE}/grupos/${grupo.id}?editar=1`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {(sp.salvo === "1" || sp.criado === "1") && (
        <Alert variant="success">
          <AlertDescription>
            {sp.criado === "1" ? "Grupo criado." : "Grupo salvo."}
            {sp.avisos ? ` ${sp.avisos} empregador(es) não entraram por já estarem em outro grupo.` : ""}
          </AlertDescription>
        </Alert>
      )}

      {sp.editar === "1" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Editar grupo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <GrupoForm
              grupo={grupo}
              representadas={representadas.map((m) => ({ id: m.empresaId!, nome: m.nome }))}
              aoCancelarHref={`${BASE}/grupos/${grupo.id}`}
            />
            <div className="border-t pt-3">
              <ExcluirGrupo grupoId={grupo.id} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="py-0">
        <CardContent className="flex flex-wrap gap-x-10 gap-y-3 py-4">
          <Numero
            rotulo="Empresas representadas"
            valor={`${representadas.length} de ${grupo.membros.length}`}
            detalhe={
              grupo.membros.length === representadas.length && grupo.membros.length > 0
                ? "Todas as empresas do grupo"
                : undefined
            }
          />
          <Numero rotulo="Filiados ativos" valor={grupo.filiadosAtivos.toLocaleString("pt-BR")} />
          <Numero rotulo="Acordos vigentes" valor={vigentes.length.toLocaleString("pt-BR")} />
          <Numero rotulo="Reuniões em 12 meses" valor={reunioes12m.toLocaleString("pt-BR")} />
          {grupo.contribuicaoCentralizada && (
            <Numero
              rotulo="Empresa pagadora"
              valor={pagadora?.nome ?? representadas[0]?.nome ?? "—"}
              detalhe="Faz o repasse das contribuições"
            />
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="grid min-w-0 content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empresas do grupo</CardTitle>
              <CardDescription>
                Representadas: empregadores com trabalhadores na base do sindicato. As demais
                aparecem para mostrar o tamanho do grupo.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {grupo.membros.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Nenhuma empresa no grupo ainda — inclua ao lado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead className="hidden md:table-cell">CNPJ</TableHead>
                      <TableHead>Representação</TableHead>
                      <TableHead className="text-right">Filiados ativos</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grupo.membros.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="max-w-64 font-medium">
                          {m.empresaId ? (
                            <Link href={`${BASE}/${m.empresaId}`} className="block truncate hover:underline">
                              {m.nome}
                            </Link>
                          ) : (
                            <span className="block truncate">{m.nome}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden font-mono text-xs md:table-cell">
                          {formatarCnpjCpf(m.cnpj)}
                        </TableCell>
                        <TableCell>
                          {m.representada ? (
                            <Badge variant="outline" className="border-success/40 text-success-fg">
                              Representada{m.inativa ? " · inativa" : ""}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Sem representação
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.representada ? m.filiadosAtivos.toLocaleString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>
                          <RemoverMembro grupoId={grupo.id} membroId={m.id} nome={m.nome} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Handshake className="size-4" />
                Acordos vigentes das empresas do grupo
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {vigentes.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhum acordo vigente.</p>
              ) : (
                vigentes.map((a) => (
                  <Link
                    key={a.id}
                    href={`/painel/representacao/acordos/${a.id}`}
                    className="hover:bg-muted/40 grid gap-0.5 rounded-md border px-3 py-2 text-sm transition-colors"
                  >
                    <span className="font-medium">{a.titulo}</span>
                    <span className="text-muted-foreground text-xs">
                      até {formatarData(a.vigenciaFim)} · {a.empresas.join(", ")}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Incluir empresa</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <AdicionarEmpregador grupoId={grupo.id} opcoes={livres} />
              <AdicionarEmpresaExterna grupoId={grupo.id} />
            </CardContent>
          </Card>
          {grupo.contribuicaoCentralizada && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="size-4" />
                  Contribuições
                </CardTitle>
                <CardDescription>
                  Em Filiação › Receitas, cada remessa mostra este grupo em &quot;Grupos com
                  contribuição centralizada&quot;: a relação do grupo é enviada uma vez só.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/painel/filiados/receitas">Abrir Receitas</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
