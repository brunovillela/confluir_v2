import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building, ExternalLink, Plus } from "lucide-react"

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
import { CartaoEditavel } from "@/components/cartao-editavel"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  assentosDoMandato,
  empregadoresPorIntegrante,
  integrantesDoMandato,
  listarInstancias,
  listarLiberacoes,
  obterMandato,
} from "@/lib/db/diretoria"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { oficiosEmitidosParaVinculo } from "@/lib/db/oficios"
import { listarAtas } from "@/lib/db/atas"
import { ROTULO_TIPO_REUNIAO } from "@/lib/atas-constantes"
import { formatarData } from "@/lib/formato"

import {
  AdicionarIntegrante,
  GrupoForm,
  MandatoForm,
  RemoverGrupo,
} from "../diretoria-forms"
import type { Integrante } from "@/lib/db/diretoria"
import {
  AdicionarAssento,
  RemoverAssento,
  RemoverLiberacao,
} from "../diretoria-extra-forms"
import { RegistrarLiberacoes } from "../liberacoes-forms"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"

import { IntegranteLinha } from "./integrante-linha"

export const metadata: Metadata = { title: "Mandato — Confluir" }

export default async function MandatoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("diretoria_mandatos", ["configuracoes"])
  const { id } = await params

  const mandato = await obterMandato(id)
  if (!mandato) notFound()

  const [
    { disponivel, lote, liberacoes },
    integrantesOpc,
    empregadores,
    atas,
    assentos,
    { disponivel: instanciasDisponiveis, instancias },
    oficios,
    fontes,
  ] = await Promise.all([
    listarLiberacoes(id),
    integrantesDoMandato(id),
    empregadoresPorIntegrante(id),
    listarAtas({ mandatoId: id }),
    assentosDoMandato(id),
    listarInstancias(),
    oficiosEmitidosParaVinculo(),
    listarFontesPagadoras(),
  ])
  const empresas = fontes.map((f) => ({
    id: f.id,
    nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
    cnpj_cpf: f.cnpj_cpf,
    bloqueado: false,
  }))

  const periodo = `${mandato.dataInicio ? formatarData(mandato.dataInicio) : "?"} – ${mandato.dataTermino ? formatarData(mandato.dataTermino) : "?"}`

  return (
    <>
      <RotuloTrilha
        valores={{
          [id]: mandato.mandato ? `Mandato ${mandato.mandato}` : "Mandato",
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional/diretoria">
            <ArrowLeft />
            Diretoria
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/painel/institucional/diretoria/instancias">
            <Building />
            Instâncias
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Mandato {mandato.mandato ?? ""}
        </h1>
        {mandato.vigente && (
          <Badge variant="outline" className="border-success/40 text-success-fg">
            Vigente
          </Badge>
        )}
      </div>

      {/* Dados do mandato: info + lápis */}
      <CartaoEditavel
        titulo={`Mandato ${mandato.mandato ?? ""}`}
        descricao={periodo}
        resumo={
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">Período</dt>
              <dd>{periodo}</dd>
            </div>
          </dl>
        }
      >
        <MandatoForm
          edicao
          dados={{
            id: mandato.id,
            mandato: mandato.mandato,
            dataInicio: mandato.dataInicio,
            dataTermino: mandato.dataTermino,
          }}
        />
      </CartaoEditavel>

      {/* Integrantes por grupo */}
      <div>
        <h2 className="text-lg font-semibold">Integrantes</h2>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
          Organizados por grupo (Diretoria Executiva, Colegiada, Conselho
          Fiscal…). Cada diretor é vinculado à pessoa pelo CPF, cruzando com{" "}
          <strong>Filiado</strong>, <strong>Usuário</strong> e{" "}
          <strong>Acesso</strong> ao painel.
        </p>

        {!mandato.integrantesDisponiveis && (
          <Alert variant="warning">
            <AlertDescription>
              A tabela de integrantes ainda não existe — rode{" "}
              <code>supabase/organizacao-diretoria.sql</code> no Supabase.
            </AlertDescription>
          </Alert>
        )}

        {mandato.integrantesDisponiveis && (
          <div className="grid gap-4">
            {!mandato.gruposDisponiveis && (
              <Alert variant="warning">
                <AlertDescription>
                  Grupos e o cruzamento por CPF usam colunas novas — rode{" "}
                  <code>supabase/diretoria-grupos.sql</code> no Supabase.
                </AlertDescription>
              </Alert>
            )}

            {mandato.gruposDisponiveis && (
              <GrupoColapsavel titulo="Grupos de membros">
                <div className="grid gap-3">
                  <GrupoForm mandatoId={mandato.id} />
                  {mandato.grupos.length > 0 && (
                    <ul className="grid gap-1">
                      {mandato.grupos.map((g) => (
                        <li
                          key={g.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span>{g.nome}</span>
                          <RemoverGrupo grupoId={g.id} mandatoId={mandato.id} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </GrupoColapsavel>
            )}

            <GrupoColapsavel titulo="Adicionar integrante">
              <AdicionarIntegrante
                mandatoId={mandato.id}
                grupos={mandato.grupos}
              />
            </GrupoColapsavel>

            {mandato.integrantes.length === 0 ? (
              <Card>
                <CardContent>
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    Nenhum integrante neste mandato ainda.
                  </p>
                </CardContent>
              </Card>
            ) : (
              [
                ...mandato.grupos.map((g) => ({ id: g.id, nome: g.nome })),
                { id: null as string | null, nome: "Sem grupo" },
              ]
                .map((g) => ({
                  ...g,
                  membros: mandato.integrantes.filter((i) => i.grupoId === g.id),
                }))
                .filter((g) => g.membros.length > 0)
                .map((g) => (
                  <GrupoMembros
                    key={g.id ?? "sem-grupo"}
                    titulo={g.nome}
                    membros={g.membros}
                    mandatoId={mandato.id}
                    grupos={mandato.grupos}
                  />
                ))
            )}
          </div>
        )}
      </div>

      {/* Instâncias: vínculos dos diretores deste mandato */}
      <div>
        <h2 className="text-lg font-semibold">Instâncias</h2>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
          Em que instâncias cada diretor deste mandato representa a entidade. As instâncias são
          cadastradas em{" "}
          <Link href="/painel/institucional/diretoria/instancias" className="text-primary hover:underline">
            Diretoria › Instâncias
          </Link>
          .
        </p>
        {instanciasDisponiveis ? (
          <div className="grid gap-4">
            <GrupoColapsavel titulo="Vincular diretor a uma instância">
              <AdicionarAssento mandatoId={mandato.id} instancias={instancias} integrantes={integrantesOpc} />
            </GrupoColapsavel>
            <Card>
              <CardContent>
                {assentos.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    Nenhum diretor deste mandato vinculado a instâncias.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Instância</TableHead>
                        <TableHead>Diretor</TableHead>
                        <TableHead>Cargo</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assentos.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>
                            <Link
                              href={`/painel/institucional/diretoria/instancias/${a.instanciaId}`}
                              className="text-primary font-medium hover:underline"
                            >
                              {a.instanciaNome ?? "—"}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">{a.integranteNome ?? "—"}</TableCell>
                          <TableCell className="text-sm">{a.cargo ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {a.mandatoInicio ? formatarData(a.mandatoInicio) : "?"}
                            {" – "}
                            {a.mandatoFim ? formatarData(a.mandatoFim) : "?"}
                          </TableCell>
                          <TableCell>
                            {a.documentoUrl ? (
                              <a
                                href={a.documentoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                              >
                                <ExternalLink className="size-3.5" />
                                abrir
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1">
                            <RemoverAssento assentoId={a.id} instanciaId={a.instanciaId} mandatoId={mandato.id} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Alert variant="warning">
            <AlertDescription>
              As instâncias usam tabelas novas — rode <code>supabase/diretoria-liberacoes-instancias.sql</code> no Supabase.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Liberações sindicais */}
      <div>
        <h2 className="text-lg font-semibold">Liberações sindicais</h2>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
          Empregadores que liberam diretores — e trabalhadores da base — para a atividade
          sindical, com saída, retorno e o ofício ou documento que oficializou
        </p>

        {!disponivel && (
          <Alert variant="warning">
            <AlertDescription>
              As liberações usam tabelas novas — rode{" "}
              <code>supabase/diretoria-liberacoes-instancias.sql</code> no Supabase.
            </AlertDescription>
          </Alert>
        )}

        {disponivel && (
          <div className="grid gap-4">
            <GrupoColapsavel titulo="Registrar liberação">
              <RegistrarLiberacoes
                mandatoId={mandato.id}
                integrantes={integrantesOpc}
                empregadoresPorIntegrante={empregadores}
                oficios={oficios}
                empresas={empresas}
                loteDisponivel={lote}
              />
            </GrupoColapsavel>

            <Card>
              <CardContent>
                {liberacoes.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    Nenhuma liberação registrada.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pessoa</TableHead>
                        <TableHead>Empregador</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Vigência</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {liberacoes.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              {l.pessoaNome ?? "—"}
                              {!l.ehDiretor && (
                                <Badge variant="outline" className="text-muted-foreground">
                                  base
                                </Badge>
                              )}
                              {l.vigente && (
                                <Badge variant="outline" className="border-success/40 text-success-fg">
                                  vigente
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{l.empresaNome ?? "—"}</TableCell>
                          <TableCell className="text-sm capitalize">
                            {l.tipo ?? "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {l.inicio ? formatarData(l.inicio) : "?"}
                            {" – "}
                            {l.fim ? formatarData(l.fim) : "permanente"}
                          </TableCell>
                          <TableCell>
                            {l.oficioId ? (
                              <Link
                                href={`/painel/ferramentas/oficios/${l.oficioId}`}
                                className="text-primary line-clamp-1 max-w-56 text-sm hover:underline"
                                title={l.oficioRotulo ?? undefined}
                              >
                                {l.oficioRotulo}
                              </Link>
                            ) : l.documentoUrl ? (
                              <a
                                href={l.documentoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                              >
                                <ExternalLink className="size-3.5" />
                                abrir
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1">
                            <RemoverLiberacao liberacaoId={l.id} mandatoId={mandato.id} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Atas de reunião (deste mandato) */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Atas de reunião</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Reuniões deste mandato, com a ata em PDF
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href={`/painel/institucional/atas/novo?mandato=${mandato.id}`}>
              <Plus />
              Nova ata
            </Link>
          </Button>
        </div>
        <Card className="mt-3">
          <CardContent>
            {atas.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nenhuma ata registrada neste mandato.
              </p>
            ) : (
              <ul className="grid gap-2">
                {atas.map((a) => (
                  <li
                    key={a.id}
                    className="border-b pb-2 last:border-b-0 last:pb-0"
                  >
                    <Link
                      href={`/painel/institucional/atas/${a.id}`}
                      className="text-primary line-clamp-1 font-medium hover:underline"
                    >
                      {a.titulo ?? "(sem título)"}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {a.data ? formatarData(a.data) : "sem data"} ·{" "}
                      {ROTULO_TIPO_REUNIAO[a.tipo]}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function GrupoMembros({
  titulo,
  membros,
  mandatoId,
  grupos,
}: {
  titulo: string
  membros: Integrante[]
  mandatoId: string
  grupos: { id: string; nome: string }[]
}) {
  return (
    <Card>
      <CardContent>
        <p className="mb-1 text-sm font-semibold">
          {titulo}{" "}
          <span className="text-muted-foreground font-normal">
            ({membros.length})
          </span>
        </p>
        <div>
          {membros.map((i) => (
            <IntegranteLinha
              key={i.id}
              integrante={i}
              mandatoId={mandatoId}
              grupos={grupos}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
