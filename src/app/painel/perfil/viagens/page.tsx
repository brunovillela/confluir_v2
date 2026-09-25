import type { Metadata } from "next"
import Link from "next/link"
import { History, Plane } from "lucide-react"

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
import { requireSessaoPainel } from "@/lib/auth"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import { minhasViagens, opcoesDoFormViagem, type Viagem } from "@/lib/db/viagens"
import { formatarData } from "@/lib/formato"

import { solicitarViagem } from "./actions"
import { CancelarViagemBotao } from "./cancelar-viagem"

export const metadata: Metadata = { title: "Minhas viagens — Confluir" }

/**
 * Autosserviço: diretores e funcionários pedem passagens e hospedagens e
 * acompanham o atendimento — inclusive as que a equipe lançou por elas.
 */
export default async function MinhasViagensPage({
  searchParams,
}: {
  searchParams: Promise<{ novo?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const usuarioId = sessao.usuario.id as string
  const { novo } = await searchParams
  const [quadro, { disponivel, viagens }, opcoes] = await Promise.all([
    quadroParaDiaria(usuarioId).catch(() => null),
    minhasViagens(usuarioId),
    opcoesDoFormViagem(),
  ])

  const emAndamento = viagens.filter(
    (v) => v.situacao === "solicitada" || v.situacao === "em_atendimento"
  )
  const historico = viagens.filter(
    (v) => v.situacao !== "solicitada" && v.situacao !== "em_atendimento"
  )

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minhas viagens</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Passagens aéreas e rodoviárias e hospedagens que o sindicato contrata para você.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            As viagens ainda não estão configuradas no sistema — procure a administração.
          </AlertDescription>
        </Alert>
      )}

      {disponivel &&
        (quadro ? (
          <ViagemForm
            acao={solicitarViagem}
            departamentos={opcoes.departamentos}
            departamentoPadrao={quadro.departamentoId}
            eventos={opcoes.eventos}
            abertoInicial={novo === "1"}
          />
        ) : (
          <Alert variant="info">
            <AlertDescription>
              Pedidos de viagem são de diretores em exercício e de funcionários com vínculo em
              vigor. Para convidados, quem pede é a equipe de viagens.
            </AlertDescription>
          </Alert>
        ))}

      <TabelaViagens
        titulo="Em andamento"
        icone={<Plane className="text-muted-foreground size-4" />}
        viagens={emAndamento}
        usuarioId={usuarioId}
        vazio="Nenhuma viagem em andamento."
      />
      <TabelaViagens
        titulo="Histórico"
        icone={<History className="text-muted-foreground size-4" />}
        viagens={historico}
        usuarioId={usuarioId}
        vazio="Nenhuma viagem anterior."
      />
    </>
  )
}

function TabelaViagens({
  titulo,
  icone,
  viagens,
  usuarioId,
  vazio,
}: {
  titulo: string
  icone: React.ReactNode
  viagens: Viagem[]
  usuarioId: string
  vazio: string
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{titulo}</CardTitle>
          {icone}
        </div>
        <CardDescription>
          {viagens.length} viage{viagens.length === 1 ? "m" : "ns"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {viagens.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{vazio}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Viagem</TableHead>
                  <TableHead className="hidden md:table-cell">Pedida por</TableHead>
                  <TableHead className="hidden sm:table-cell">Pedida em</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viagens.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="min-w-60 text-sm whitespace-normal">
                      <Link
                        href={`/painel/perfil/viagens/${v.id}`}
                        className="hover:text-primary block"
                      >
                        <span className="text-muted-foreground text-xs">
                          Nº {v.numero ?? "—"} · {v.motivo}
                        </span>
                        <ResumoItensViagem itens={v.itens} />
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {v.solicitanteId === usuarioId ? "Você" : (v.solicitanteNome ?? "—")}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                      {formatarData(v.createdAt)}
                    </TableCell>
                    <TableCell>
                      <SituacaoViagemBadge situacao={v.situacao} />
                    </TableCell>
                    <TableCell className="text-right">
                      {v.situacao === "solicitada" ? (
                        <CancelarViagemBotao id={v.id} />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
