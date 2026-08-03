import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileWarning } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { CobrancaBadge } from "@/components/veiculos"
import { requirePermissao } from "@/lib/auth"
import {
  listarInfracoes,
  listarUsuariosAtivos,
  listarVeiculos,
} from "@/lib/db/veiculos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { NovaInfracaoForm } from "./infracao-forms"

export const metadata: Metadata = { title: "Infrações de trânsito — Confluir" }

export default async function InfracoesPage() {
  const sessao = await requirePermissao("veiculos", ["veiculos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")

  const [infracoes, frota, usuarios] = await Promise.all([
    gestor
      ? listarInfracoes({ limite: 200 })
      : listarInfracoes({ condutorId: sessao.usuario.id, limite: 100 }),
    gestor ? listarVeiculos({ situacao: "todos" }) : Promise.resolve([]),
    gestor ? listarUsuariosAtivos() : Promise.resolve([]),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos">
            <ArrowLeft />
            Veículos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Infrações de trânsito
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {gestor
            ? "Multas da frota: notificação, justificativa, avaliação e cobrança"
            : "Suas infrações — apresente a justificativa quando notificado"}
        </p>
      </div>

      {gestor && (
        <GrupoColapsavel
          titulo="Registrar infração"
          descricao="A notificação chega ao condutor por sino e email"
        >
          <NovaInfracaoForm
            veiculos={frota.map((v) => ({
              id: v.id,
              rotulo: `${v.placa ?? "s/ placa"} — ${v.marca_modelo ?? ""}`,
            }))}
            usuarios={usuarios.map((u) => ({ id: u.id, rotulo: u.nome }))}
          />
        </GrupoColapsavel>
      )}

      <Card>
        <CardContent>
          {infracoes.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <FileWarning className="mx-auto mb-2 size-5" />
              {gestor
                ? "Nenhuma infração registrada."
                : "Você não tem infrações registradas."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Veículo</TableHead>
                  {gestor && <TableHead>Condutor</TableHead>}
                  <TableHead>Gravidade</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Justificativa</TableHead>
                  <TableHead>Cobrança</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {infracoes.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Link
                        href={`/painel/veiculos/infracoes/${i.id}`}
                        className="text-primary whitespace-nowrap hover:underline"
                      >
                        {formatarData(i.infracao_data)}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {i.veiculoPlaca ?? "—"}
                    </TableCell>
                    {gestor && <TableCell>{i.condutorNome ?? "—"}</TableCell>}
                    <TableCell>{i.infracao_tipo ?? "—"}</TableCell>
                    <TableCell className="max-w-72">
                      <span className="line-clamp-1">{i.descricao ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(i.custo)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {i.justificativa_em
                        ? i.avaliadorNome
                          ? i.justificativa_sindical
                            ? "Aceita (sindical)"
                            : "Não sindical"
                          : "Aguardando avaliação"
                        : "Pendente"}
                    </TableCell>
                    <TableCell>
                      <CobrancaBadge situacao={i.cobranca_situacao} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!gestor && (
        <Alert variant="info">
          <AlertDescription>
            Infrações em atividade sindical são assumidas pelo sindicato; nas
            demais, o valor é descontado em contracheque ou nas diárias,
            conforme avaliação.
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
