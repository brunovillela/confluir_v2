import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, IdCard } from "lucide-react"

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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  listarCondutores,
  listarUsuariosAtivos,
  urlArquivoVeiculos,
} from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"

import { AutorizacaoForm, CondutorForm } from "./condutor-forms"

export const metadata: Metadata = { title: "Condutores — Confluir" }

export default async function CondutoresPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("veiculos_gestao")
  const { salvo } = await searchParams

  const [{ disponivel, condutores }, usuarios] = await Promise.all([
    listarCondutores(),
    listarUsuariosAtivos(),
  ])

  const cnhUrls = new Map(
    await Promise.all(
      condutores
        .filter((c) => c.cnh_arquivo_url)
        .map(async (c) => [c.id, await urlArquivoVeiculos(c.cnh_arquivo_url)] as const)
    )
  )

  const jaCadastrados = new Set(condutores.map((c) => c.usuario_id))
  const opcoesNovos = usuarios
    .filter((u) => !jaCadastrados.has(u.id))
    .map((u) => ({ id: u.id, rotulo: u.nome }))
  const opcoesTodos = usuarios.map((u) => ({ id: u.id, rotulo: u.nome }))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos">
            <ArrowLeft />
            Veículos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Condutores</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cadastro de CNH e autorização — só condutor autorizado com CNH em dia
          retira veículo
        </p>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Cadastro salvo.</AlertDescription>
        </Alert>
      )}
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Condutores ainda não configurados — rode{" "}
            <code>supabase/veiculos.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <GrupoColapsavel
        titulo="Cadastrar condutor"
        descricao="Vincule um usuário do painel e registre os dados da CNH"
      >
        <CondutorForm usuarios={opcoesNovos} />
      </GrupoColapsavel>

      <Card>
        <CardContent>
          {condutores.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <IdCard className="mx-auto mb-2 size-5" />
              Nenhum condutor cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Condutor</TableHead>
                  <TableHead>CNH</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Autorização</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {condutores.map((c) => {
                  const cnhUrl = cnhUrls.get(c.id)
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.usuarioNome ?? "(sem nome)"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {c.cnh_numero ?? "—"}
                        {cnhUrl && (
                          <a
                            href={cnhUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary ml-2 inline-flex align-middle"
                            aria-label="Abrir CNH digitalizada"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell>{c.cnh_categoria ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {c.cnh_validade ? formatarData(c.cnh_validade) : "—"}
                      </TableCell>
                      <TableCell>
                        {!c.autorizado ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            Não autorizado
                          </Badge>
                        ) : c.cnhVencida ? (
                          <Badge
                            variant="outline"
                            className="border-destructive/40 text-destructive"
                          >
                            CNH vencida
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-success/40 text-success-fg"
                          >
                            Apto
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <AutorizacaoForm
                          condutorId={c.id}
                          autorizado={c.autorizado}
                          nome={c.usuarioNome ?? "este condutor"}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <GrupoColapsavel
        titulo="Atualizar cadastro de um condutor"
        descricao="Renovação de CNH, categoria ou observações"
      >
        <div className="grid gap-6">
          {condutores.map((c) => (
            <div key={c.id} className="grid gap-2">
              <p className="text-sm font-medium">{c.usuarioNome ?? "(sem nome)"}</p>
              <CondutorForm
                usuarios={opcoesTodos}
                dados={{
                  usuario_id: c.usuario_id,
                  cnh_numero: c.cnh_numero,
                  cnh_categoria: c.cnh_categoria,
                  cnh_validade: c.cnh_validade,
                  observacao: c.observacao,
                }}
              />
            </div>
          ))}
        </div>
      </GrupoColapsavel>
    </>
  )
}
