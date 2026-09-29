import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Landmark, Mail, Users } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import {
  centrosDeCustoDespesa,
  listarContasDiaria,
  listarTiposDespesaDiaria,
  ROTULO_QUADRO,
  tiposDeViagem,
  type QuadroConta,
} from "@/lib/db/diarias-config"
import { equipeDeViagens, obterConfigViagens } from "@/lib/db/viagens"

import { ConfigViagensForm } from "./config-form"

export const metadata: Metadata = { title: "Configurações de viagens — Confluir" }

const QUADROS: QuadroConta[] = ["diretor", "funcionario", "convidado"]

/**
 * Configurações de Viagens: as contas contábeis (que moram no de-para das
 * diárias — aqui só o retrato e o atalho), o aviso de pedidos novos, a
 * antecedência, as orientações e quem atende.
 */
export default async function ConfiguracoesViagensPage() {
  await requirePermissao("viagens_gestao")
  const [config, { contas }, { tipos }, centros, equipe] = await Promise.all([
    obterConfigViagens(),
    listarContasDiaria().catch(() => ({ contas: [] })),
    listarTiposDespesaDiaria().catch(() => ({ tipos: [] })),
    centrosDeCustoDespesa().catch(() => []),
    equipeDeViagens().catch(() => []),
  ])
  const nomeCentro = new Map(centros.map((c) => [c.id, c.nome]))
  const deViagem = tiposDeViagem(tipos)
  const gastos = [
    { rotulo: "Passagem", tipoId: deViagem.passagem },
    { rotulo: "Hospedagem", tipoId: deViagem.hospedagem },
  ]

  const situacao = (quadro: QuadroConta, tipoId: string | null) => {
    if (!tipoId) return { padrao: null, departamentos: 0 }
    const doGasto = contas.filter((c) => c.quadro === quadro && c.despesaTipoId === tipoId)
    const padrao = doGasto.find((c) => !c.departamentoId)
    return {
      padrao: padrao ? (nomeCentro.get(padrao.centroCustoId) ?? "conta definida") : null,
      departamentos: doGasto.filter((c) => c.departamentoId).length,
    }
  }
  const semNenhuma = QUADROS.some((q) =>
    gastos.some((g) => {
      const s = situacao(q, g.tipoId)
      return !s.padrao && s.departamentos === 0
    })
  )

  return (
    <>
      <RotuloTrilha valores={{ configuracoes: "Configurações" }} />
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/painel/institucional/viagens">
            <ArrowLeft />
            Passagens e hospedagens
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          As contas das faturas, quem é avisado dos pedidos novos e o que o formulário orienta.
        </p>
      </div>

      {!config.disponivel && (
        <Alert>
          <AlertDescription>
            Rode supabase/viagens-config.sql para liberar o aviso, a antecedência e as
            orientações.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Centros de custo</CardTitle>
            <Landmark className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            A conta de cada item da fatura sai do quadro de quem viaja, do departamento que banca e
            do tipo de gasto. As contas moram no de-para das diárias — é o mesmo plano de contas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {(!deViagem.passagem || !deViagem.hospedagem) && (
            <Alert variant="warning">
              <AlertDescription>
                Não achei os tipos de despesa &ldquo;Passagem&rdquo; e &ldquo;Hospedagem&rdquo; nas
                diárias — as faturas ficam sem conta sugerida. Confira os nomes em Diárias →
                Centros de custo.
              </AlertDescription>
            </Alert>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quem viaja</TableHead>
                  {gastos.map((g) => (
                    <TableHead key={g.rotulo}>{g.rotulo} — conta padrão</TableHead>
                  ))}
                  <TableHead className="text-right">Ajustar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {QUADROS.map((q) => (
                  <TableRow key={q}>
                    <TableCell className="font-medium">{ROTULO_QUADRO[q]}</TableCell>
                    {gastos.map((g) => {
                      const s = situacao(q, g.tipoId)
                      return (
                        <TableCell key={g.rotulo} className="whitespace-normal">
                          {s.padrao ?? (
                            <span className={s.departamentos ? "text-muted-foreground" : "text-warning-fg"}>
                              Sem conta padrão
                            </span>
                          )}
                          {s.departamentos > 0 && (
                            <span className="text-muted-foreground block text-xs">
                              + {s.departamentos}{" "}
                              {s.departamentos === 1 ? "departamento" : "departamentos"} com conta
                              própria
                            </span>
                          )}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/painel/pessoal/diarias/contas?quadro=${q}`}>
                          <ExternalLink />
                          Configurar
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {semNenhuma && (
            <p className="text-muted-foreground text-xs">
              Onde não há conta, a fatura pede para escolher a conta linha por linha.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pedidos e orientações</CardTitle>
            <Mail className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent>
          <ConfigViagensForm
            emailsAviso={config.emailsAviso}
            antecedenciaDias={config.antecedenciaDias}
            orientacoes={config.orientacoes}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Quem atende</CardTitle>
            <Users className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            Quem tem a permissão &ldquo;Passagens e hospedagens — atender e lançar&rdquo;, direto
            ou por perfil. Administradores também entram.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {equipe.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ninguém além dos administradores.</p>
          ) : (
            <ul className="divide-y text-sm">
              {equipe.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <Link
                    href={`/painel/institucional/usuarios/${p.id}`}
                    className="hover:text-primary font-medium"
                  >
                    {p.nome}
                  </Link>
                  <span className="text-muted-foreground text-xs">{p.email ?? "sem e-mail"}</span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button asChild variant="outline" size="sm">
              <Link href="/painel/institucional/usuarios">
                <ExternalLink />
                Usuários e permissões
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
