import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building, FileText, UserCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area"
import { CartaoEditavel } from "@/components/cartao-editavel"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import { listarAtas } from "@/lib/db/atas"
import { departamentosPorUsuario } from "@/lib/db/departamentos"
import {
  assentosDoMandato,
  listarLiberacoes,
  obterMandato,
} from "@/lib/db/diretoria"
import type { Integrante } from "@/lib/db/diretoria"
import { formatarData } from "@/lib/formato"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"

import {
  AdicionarIntegrante,
  GrupoForm,
  MandatoForm,
  RemoverGrupo,
} from "../diretoria-forms"
import { IntegranteLinha } from "./integrante-linha"

export const metadata: Metadata = { title: "Mandato — Confluir" }

/**
 * O mandato: dados, atalhos para Instâncias, Liberações e Atas (páginas
 * próprias, pedido do Bruno em 18/09) e os integrantes por grupo — cada linha
 * com departamento, instâncias, liberação e situação (licenciado/excluído).
 */
export default async function MandatoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("diretoria_mandatos", ["configuracoes"])
  const { id } = await params

  const mandato = await obterMandato(id)
  if (!mandato) notFound()

  const [{ liberacoes }, atas, assentos, departamentos] = await Promise.all([
    listarLiberacoes(id),
    listarAtas({ mandatoId: id }),
    assentosDoMandato(id),
    departamentosPorUsuario(
      mandato.integrantes.map((i) => i.usuarioId).filter((u): u is string => Boolean(u))
    ),
  ])
  const hoje = new Date().toISOString().slice(0, 10)
  const assentosVigentes = assentos.filter((a) => !a.mandatoFim || a.mandatoFim >= hoje).length
  const liberacoesVigentes = liberacoes.filter((l) => l.vigente).length
  const base = `/painel/institucional/diretoria/${mandato.id}`

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

      <div className={GRADE_AREAS}>
        <CartaoArea
          titulo="Instâncias"
          descricao="Onde os diretores deste mandato representam a entidade"
          href={`${base}/instancias`}
          icone={Building}
          indicador={`${assentosVigentes} ${assentosVigentes === 1 ? "vínculo vigente" : "vínculos vigentes"}`}
        />
        <CartaoArea
          titulo="Liberações sindicais"
          descricao="Saída e retorno de diretores e da base, com o ofício"
          href={`${base}/liberacoes`}
          icone={UserCheck}
          indicador={`${liberacoesVigentes} ${liberacoesVigentes === 1 ? "vigente" : "vigentes"} · ${liberacoes.length} no total`}
        />
        <CartaoArea
          titulo="Atas de reunião"
          descricao="Reuniões deste mandato, com a ata em PDF"
          href={`${base}/atas`}
          icone={FileText}
          indicador={`${atas.length} ${atas.length === 1 ? "ata" : "atas"}`}
        />
      </div>

      {/* Integrantes por grupo */}
      <div>
        <h2 className="text-lg font-semibold">Integrantes</h2>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
          Por grupo (Diretoria Executiva, Colegiada, Conselho Fiscal…). Cada linha
          mostra o departamento da pessoa, as instâncias, se está liberada e se está
          licenciada ou excluída. O vínculo com a pessoa é pelo CPF, cruzando com{" "}
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
                    departamentos={departamentos}
                  />
                ))
            )}
          </div>
        )}
      </div>
    </>
  )
}

function GrupoMembros({
  titulo,
  membros,
  mandatoId,
  grupos,
  departamentos,
}: {
  titulo: string
  membros: Integrante[]
  mandatoId: string
  grupos: { id: string; nome: string }[]
  departamentos: Map<string, string[]>
}) {
  const afastados = membros.filter((m) => m.situacao !== "exercicio").length
  return (
    <Card>
      <CardContent>
        <p className="mb-1 text-sm font-semibold">
          {titulo}{" "}
          <span className="text-muted-foreground font-normal">
            ({membros.length}
            {afastados ? ` · ${afastados} licenciado(s) ou excluído(s)` : ""})
          </span>
        </p>
        <div>
          {membros.map((i) => (
            <IntegranteLinha
              key={i.id}
              integrante={i}
              mandatoId={mandatoId}
              grupos={grupos}
              departamentos={i.usuarioId ? (departamentos.get(i.usuarioId) ?? []) : []}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
