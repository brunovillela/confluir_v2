import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, FileText } from "lucide-react"

import { CartaoEditavel } from "@/components/cartao-editavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { formatarCpf } from "@/lib/cpf"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { obterHomologacao, urlParecer } from "@/lib/db/juridico"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"

import { EditarHomologacaoForm } from "../homologacao-forms"

export const metadata: Metadata = { title: "Homologação — Confluir" }

export default async function HomologacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("juridico_geral", [
    "juridico_gestao",
    "juridico_homologacoes",
  ])

  const { id } = await params
  const { salvo } = await searchParams

  const [h, fontes] = await Promise.all([
    obterHomologacao(id),
    listarFontesPagadoras(),
  ])
  if (!h) notFound()

  const parecerUrl = await urlParecer(h.parecer_url)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/juridico/homologacoes">
            <ArrowLeft />
            Homologações
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {h.trabalhador ?? "Trabalhador não informado"}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Rescisão homologada em {formatarData(h.data)}
            </p>
          </div>
          {h.filiado ? (
            <Badge variant="secondary">Filiado</Badge>
          ) : (
            <Badge variant="outline">Não-filiado</Badge>
          )}
        </div>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Homologação salva com sucesso.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Dado rotulo="Data da homologação" valor={formatarData(h.data)} />
            <Dado
              rotulo="Data da demissão"
              valor={h.data_demissao ? formatarData(h.data_demissao) : "—"}
            />
            <Dado rotulo="Motivo da rescisão" valor={h.motivo ?? "—"} />
            <Dado rotulo="Empregador" valor={h.empregador ?? "—"} />
            <Dado
              rotulo="CPF do trabalhador"
              valor={h.cpf ? formatarCpf(h.cpf) : "—"}
            />
            <Dado
              rotulo="Vínculo"
              valor={h.filiado ? "Filiado ao sindicato" : "Não-filiado"}
            />
            {h.observacoes && (
              <div className="sm:col-span-2">
                <Dado rotulo="Observações" valor={h.observacoes} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <FileText className="text-muted-foreground size-4" />
              Parecer jurídico
            </p>
            {parecerUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a href={parecerUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Abrir parecer
                </a>
              </Button>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nenhum parecer anexado. Use a edição abaixo para enviar um PDF.
              </p>
            )}
            <div className="text-muted-foreground mt-2 grid gap-1 text-xs">
              {h.registradoPor && <p>Registrado por {h.registradoPor}</p>}
              {h.created_at && (
                <p>Cadastrado em {formatarDataHora(h.created_at)}</p>
              )}
              {h.updated_at && h.updated_at !== h.created_at && (
                <p>Atualizado em {formatarDataHora(h.updated_at)}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <CartaoEditavel
        titulo="Editar homologação"
        descricao="Corrija os dados da rescisão ou anexe o parecer jurídico"
        resumo={
          <p className="text-muted-foreground text-sm">
            Clique no lápis para alterar datas, motivo, empregador,
            identificação do trabalhador ou o parecer.
          </p>
        }
      >
        <EditarHomologacaoForm
          buscaFiliadoEndpoint="/painel/juridico/homologacoes/busca-filiado"
          fontes={fontes.map((f) => ({ id: f.id, rotulo: nomeFonte(f) }))}
          inicial={{
            id: h.id,
            data: h.data,
            data_demissao: h.data_demissao,
            motivo: h.motivo,
            fonte_pg_id: h.fonte_pg_id,
            observacoes: h.observacoes,
            filiadoInicial: h.filiado_id
              ? {
                  id: h.filiado_id,
                  nome_completo: h.trabalhador,
                  cpf: h.cpf,
                  matricula_sindical: null,
                  filiacao_condicao: null,
                }
              : null,
            trabalhador_nome: h.trabalhador_nome,
            trabalhador_cpf: h.trabalhador_cpf,
            temParecer: Boolean(h.parecer_url),
          }}
        />
      </CartaoEditavel>
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

function nomeFonte(f: {
  nome_fantasia: string | null
  nome_razao: string | null
  cnpj_cpf: string | null
}): string {
  const nome = f.nome_fantasia ?? f.nome_razao ?? "(sem nome)"
  return f.cnpj_cpf ? `${nome} — ${formatarCnpjCpf(f.cnpj_cpf)}` : nome
}
