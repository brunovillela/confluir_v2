import type { Metadata } from "next"
import Link from "next/link"
import { Plane } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ViagemForm } from "@/components/viagem-form"
import { ResumoItensViagem, SituacaoViagemBadge } from "@/components/viagens"
import { requirePermissao } from "@/lib/auth"
import { diretoresParaDiaria } from "@/lib/db/diarias-diretoria"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"
import { listarViagens, opcoesDoFormViagem } from "@/lib/db/viagens"
import { formatarData } from "@/lib/formato"
import { ROTULO_BENEFICIARIO } from "@/lib/viagens-constantes"

import { lancarViagem } from "./actions"

export const metadata: Metadata = { title: "Passagens e hospedagens — Confluir" }

/**
 * Gestão das viagens: tudo o que foi pedido, e o lançamento em nome de
 * diretor sem conta, funcionário ou convidado de evento.
 */
export default async function ViagensPage() {
  await requirePermissao("viagens_gestao")
  const [{ disponivel, viagens }, opcoes, diretores, funcionarios] = await Promise.all([
    listarViagens(),
    opcoesDoFormViagem(),
    diretoresParaDiaria().catch(() => []),
    funcionariosParaSelecao().catch(() => []),
  ])

  const abertas = viagens.filter(
    (v) => v.situacao === "solicitada" || v.situacao === "em_atendimento"
  ).length

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Passagens e hospedagens</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Viagens de diretores, funcionários e convidados que o sindicato contrata e paga.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            As tabelas de viagens ainda não existem — rode supabase/viagens.sql.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <ViagemForm
          acao={lancarViagem}
          rotulo="Lançar viagem"
          departamentos={opcoes.departamentos}
          departamentoPadrao={null}
          eventos={opcoes.eventos}
          pessoas={{
            diretores: diretores.map((d) => ({
              usuarioId: d.usuarioId,
              nome: d.cargo ? `${d.nome} — ${d.cargo}` : d.nome,
              departamentoId: d.departamentoId,
            })),
            funcionarios: funcionarios.map((f) => ({
              usuarioId: f.usuarioId,
              nome: f.nome,
              departamentoId: null,
            })),
          }}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Solicitações</CardTitle>
            <Plane className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {viagens.length} no total · {abertas} aguardando atendimento
          </CardDescription>
        </CardHeader>
        <CardContent>
          {viagens.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma viagem pedida ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Nº</TableHead>
                    <TableHead>Quem viaja</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead className="hidden lg:table-cell">Departamento</TableHead>
                    <TableHead className="hidden sm:table-cell">Pedida em</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viagens.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="tabular-nums">
                        <Link href={`/painel/viagens/${v.id}`} className="text-primary hover:underline">
                          {v.numero ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/painel/viagens/${v.id}`} className="hover:text-primary font-medium">
                          {v.beneficiarioNome}
                        </Link>
                        <span className="text-muted-foreground block text-xs">
                          {ROTULO_BENEFICIARIO[v.beneficiarioTipo]}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-60 text-sm whitespace-normal">
                        <ResumoItensViagem itens={v.itens} />
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {v.departamentoNome ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                        {formatarData(v.createdAt)}
                      </TableCell>
                      <TableCell>
                        <SituacaoViagemBadge situacao={v.situacao} />
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
