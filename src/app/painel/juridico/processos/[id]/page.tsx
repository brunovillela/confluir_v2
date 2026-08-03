import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, Receipt, Users } from "lucide-react"

import { CartaoEditavel } from "@/components/cartao-editavel"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { SituacaoReembolsoBadge } from "@/components/juridico"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { formatarCpf } from "@/lib/cpf"
import { listarFornecedores } from "@/lib/db/compras"
import {
  listarReembolsosDoProcesso,
  obterProcesso,
  totalReembolsado,
  urlComprovanteReembolso,
} from "@/lib/db/juridico"
import { listarUsuariosAtivos } from "@/lib/db/veiculos"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { EditarProcessoForm } from "../processo-forms"
import {
  AvaliarReembolsoForm,
  RegistrarReembolsoForm,
} from "../reembolso-forms"

export const metadata: Metadata = { title: "Processo — Confluir" }

export default async function ProcessoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("juridico_geral", [
    "juridico_gestao",
    "juridico_homologacoes",
  ])
  const podeAprovar = podeAcessar(sessao.permissoes, "juridico_gestao", [
    "juridico_geral",
  ])

  const { id } = await params
  const { salvo } = await searchParams

  const [pr, responsaveis, fornecedores, reembolsos] = await Promise.all([
    obterProcesso(id),
    listarUsuariosAtivos(),
    listarFornecedores(),
    listarReembolsosDoProcesso(id),
  ])
  if (!pr) notFound()

  const escritorios = fornecedores.map((f) => ({
    id: f.id,
    nome: f.nome,
    cnpj_cpf: f.cnpj_cpf,
    bloqueado: f.bloqueado,
  }))

  const totalPago = totalReembolsado(reembolsos.linhas)
  const comprovantes = new Map(
    await Promise.all(
      reembolsos.linhas.map(
        async (r) =>
          [r.id, await urlComprovanteReembolso(r.comprovante_despesa)] as const
      )
    )
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/juridico/processos">
            <ArrowLeft />
            Processos
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">
              {pr.numero_processo ?? "Processo sem número"}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {pr.tipo ?? "Área não informada"} ·{" "}
              {pr.coletivo ? "Coletivo" : "Individual"}
              {pr.data_abertura && <> · aberto em {formatarData(pr.data_abertura)}</>}
            </p>
          </div>
          <Badge variant={pr.finalizado ? "outline" : "secondary"}>
            {pr.status_processo ??
              (pr.finalizado ? "Finalizado" : "Em andamento")}
          </Badge>
        </div>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Processo salvo com sucesso.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Dado rotulo="Número" valor={pr.numero_processo ?? "—"} />
            <Dado
              rotulo="Data de abertura"
              valor={pr.data_abertura ? formatarData(pr.data_abertura) : "—"}
            />
            <Dado rotulo="Área do direito" valor={pr.tipo ?? "—"} />
            <Dado rotulo="Natureza" valor={pr.coletivo ? "Coletivo" : "Individual"} />
            <Dado rotulo="Status" valor={pr.status_processo ?? "—"} />
            <Dado rotulo="Responsável" valor={pr.responsavel ?? "—"} />
            <Dado
              rotulo="Escritório responsável"
              valor={pr.escritorio ?? "—"}
            />
            <Dado
              rotulo="Parte assessorada"
              valor={pr.parte_assessorada ?? "—"}
            />
            <Dado
              rotulo="Parte(s) contrária(s)"
              valor={
                pr.outras_partes && pr.outras_partes.length > 0
                  ? pr.outras_partes.join(", ")
                  : "—"
              }
            />
            {pr.observacoes && (
              <div className="sm:col-span-2">
                <Dado rotulo="Observações" valor={pr.observacoes} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Users className="text-muted-foreground size-4" />
              Filiados envolvidos
            </p>
            {pr.filiados.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum filiado vinculado.
              </p>
            ) : (
              <ul className="grid gap-2">
                {pr.filiados.map((f) => (
                  <li key={f.id} className="grid">
                    <Link
                      href={`/painel/filiados/${f.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {f.nome ?? "(sem nome)"}
                    </Link>
                    {f.cpf && (
                      <span className="text-muted-foreground font-mono text-xs">
                        {formatarCpf(f.cpf)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="text-muted-foreground mt-2 grid gap-1 text-xs">
              {pr.registradoPor && <p>Cadastrado por {pr.registradoPor}</p>}
              {pr.created_at && (
                <p>Cadastrado em {formatarDataHora(pr.created_at)}</p>
              )}
              {pr.updated_at && pr.updated_at !== pr.created_at && (
                <p>Atualizado em {formatarDataHora(pr.updated_at)}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <CartaoEditavel
        titulo="Editar processo"
        descricao="Atualize status, responsável, filiados e demais dados"
        resumo={
          <p className="text-muted-foreground text-sm">
            Clique no lápis para alterar os dados do processo ou os filiados
            envolvidos.
          </p>
        }
      >
        <EditarProcessoForm
          buscaFiliadoEndpoint="/painel/juridico/processos/busca-filiado"
          responsaveis={responsaveis.map((u) => ({ id: u.id, nome: u.nome }))}
          escritorios={escritorios}
          inicial={{
            id: pr.id,
            numero_processo: pr.numero_processo,
            tipo: pr.tipo,
            coletivo: pr.coletivo,
            status_processo: pr.status_processo,
            data_abertura: pr.data_abertura,
            parte_assessorada: pr.parte_assessorada,
            outras_partes: pr.outras_partes,
            observacoes: pr.observacoes,
            assessoria_id: pr.assessoria_id,
            responsavel_id: pr.responsavel_id,
            filiados: pr.filiados.map((f) => ({
              id: f.id,
              nome: f.nome,
              cpf: f.cpf,
            })),
          }}
        />
      </CartaoEditavel>

      {/* Reembolsos ao escritório */}
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Receipt className="text-muted-foreground size-4" />
              Reembolsos ao escritório
            </p>
            {totalPago > 0 && (
              <p className="text-muted-foreground text-sm">
                Total aprovado:{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {formatarMoeda(totalPago)}
                </span>
              </p>
            )}
          </div>

          {!reembolsos.disponivel && (
            <Alert variant="warning">
              <AlertDescription>
                Reembolsos ainda não configurados — rode{" "}
                <code>supabase/juridico-reembolsos.sql</code> no Supabase.
              </AlertDescription>
            </Alert>
          )}

          {reembolsos.disponivel && reembolsos.linhas.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nenhuma despesa registrada para este processo.
            </p>
          )}

          {reembolsos.linhas.map((r) => (
            <div key={r.id} className="grid gap-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium tabular-nums">
                    {formatarMoeda(r.valor)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {r.descricao_despesa ?? "—"}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {r.data_despesa && <>Despesa em {formatarData(r.data_despesa)} · </>}
                    {r.solicitante && <>por {r.solicitante} · </>}
                    {r.created_at && formatarDataHora(r.created_at)}
                    {r.ordemCodigo && <> · ordem {r.ordemCodigo}</>}
                  </p>
                </div>
                <SituacaoReembolsoBadge situacao={r.situacaoExibida} />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                {comprovantes.get(r.id) && (
                  <a
                    href={comprovantes.get(r.id)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    Comprovante
                  </a>
                )}
                {r.avaliacao_observacao && (
                  <span className="text-muted-foreground">
                    Obs.: {r.avaliacao_observacao}
                  </span>
                )}
              </div>

              {podeAprovar && r.situacao === "aguardando" && (
                <div className="mt-1 border-t pt-3">
                  <AvaliarReembolsoForm reembolsoId={r.id} processoId={pr.id} />
                </div>
              )}
            </div>
          ))}

          {reembolsos.disponivel && (
            <GrupoColapsavel
              titulo="Registrar despesa"
              descricao="Lance uma despesa do escritório para reembolso"
            >
              <RegistrarReembolsoForm processoId={pr.id} />
            </GrupoColapsavel>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-0.5 text-sm">{valor}</p>
    </div>
  )
}
