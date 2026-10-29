import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarLotes } from "@/lib/db/filiacao-atualizacao-lista"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { formatarDataHora } from "@/lib/formato"

import { EnviarLista } from "./enviar-lista"
import { SituacaoLote } from "./situacao-lote"

export const metadata: Metadata = { title: "Atualizar cadastros por lista — Confluir" }
// A leitura pela IA de uma lista grande passa de um minuto.
export const maxDuration = 300

export default async function AtualizarPorListaPage() {
  await requirePermissao("filiacao_gestao")
  const [fontes, lotes] = await Promise.all([listarFontesPagadoras(), listarLotes()])
  const opcoes = fontes
    .map((f) => ({ id: f.id, nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Atualizar cadastros por lista</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Envie a lista de trabalhadores que a empresa mandou — planilha, CSV,
          PDF ou foto. A IA lê o arquivo, o sistema padroniza os dados, acha
          quem já tem cadastro (CPF, matrícula na fonte, nome com nascimento
          ou, como sugestão, só o nome) e mostra, campo a campo, o que
          mudaria. A leitura roda em segundo plano. Nada é gravado antes
          da sua conferência, e um lote aplicado pode ser desfeito.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova lista</CardTitle>
        </CardHeader>
        <CardContent>
          <EnviarLista fontes={opcoes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listas enviadas</CardTitle>
          <CardDescription>As 30 mais recentes. Abra uma para ver o que mudou ou desfazer.</CardDescription>
        </CardHeader>
        <CardContent>
          {lotes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma lista enviada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead>Enviada</TableHead>
                    <TableHead className="text-right">Trabalhadores</TableHead>
                    <TableHead className="text-right">Atualizados</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lotes.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-64 truncate font-medium">
                        <Link href={`/painel/filiados/saude-cadastros/atualizar/${l.id}`} className="underline-offset-4 hover:underline">
                          {l.arquivo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-48 truncate">{l.fonteNome ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatarDataHora(l.criadoEm)}
                        {l.criadoPorNome ? ` · ${l.criadoPorNome}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.linhasLidas}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.resumo?.pessoas ?? "—"}</TableCell>
                      <TableCell>
                        <SituacaoLote situacao={l.situacao} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
