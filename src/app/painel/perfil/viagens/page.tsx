import type { Metadata } from "next"
import Link from "next/link"
import { History, Plane, Users } from "lucide-react"

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
import { VoltarPerfil } from "@/components/voltar-perfil"
import { requireSessaoPainel } from "@/lib/auth"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import {
  minhasViagens,
  obterConfigViagens,
  opcoesDoFormViagem,
  pessoasParaViagem,
  viagensPedidasParaTerceiros,
  type Viagem,
} from "@/lib/db/viagens"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { solicitarViagem } from "./actions"
import { CancelarViagemBotao } from "./cancelar-viagem"

export const metadata: Metadata = { title: "Minhas viagens — Confluir" }

/**
 * Autosserviço: diretores e funcionários pedem passagens e hospedagens e
 * acompanham o atendimento — inclusive as que a equipe lançou por elas. Quem
 * tem a permissão também pede para outra pessoa e acompanha esses pedidos.
 */
export default async function MinhasViagensPage({
  searchParams,
}: {
  searchParams: Promise<{ novo?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const usuarioId = sessao.usuario.id as string
  const { novo } = await searchParams
  const podeTerceiros = podeAcessar(sessao.permissoes, "viagens_solicitar_terceiros")
  const [quadro, { disponivel, viagens }, opcoes, config, pessoas, pedidas] = await Promise.all([
    quadroParaDiaria(usuarioId).catch(() => null),
    minhasViagens(usuarioId),
    opcoesDoFormViagem(),
    obterConfigViagens().catch(() => null),
    podeTerceiros ? pessoasParaViagem() : undefined,
    podeTerceiros ? viagensPedidasParaTerceiros(usuarioId) : [],
  ])
  const podeProprio = !!quadro && podeAcessar(sessao.permissoes, "viagens_solicitar")

  const emAndamento = viagens.filter(
    (v) => v.situacao === "solicitada" || v.situacao === "em_atendimento"
  )
  const historico = viagens.filter(
    (v) => v.situacao !== "solicitada" && v.situacao !== "em_atendimento"
  )

  return (
    <>
      <VoltarPerfil />
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
        (podeProprio || podeTerceiros ? (
          <ViagemForm
            acao={solicitarViagem}
            departamentos={opcoes.departamentos}
            departamentoPadrao={podeProprio ? quadro.departamentoId : null}
            eventos={opcoes.eventos}
            pessoas={pessoas}
            paraQuem={{ proprio: podeProprio, terceiros: podeTerceiros }}
            abertoInicial={novo === "1"}
            orientacoes={config?.orientacoes ?? null}
            antecedenciaDias={config?.antecedenciaDias ?? null}
          />
        ) : (
          <Alert variant="info">
            <AlertDescription>
              {quadro
                ? "Sua conta não tem permissão para pedir viagem. Se precisar, procure a administração."
                : "Pedidos de viagem são de diretores em exercício e de funcionários com vínculo em vigor. Para outras pessoas, procure a equipe de viagens."}
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
      {podeTerceiros && (
        <TabelaViagens
          titulo="Pedidas para outras pessoas"
          icone={<Users className="text-muted-foreground size-4" />}
          viagens={pedidas}
          usuarioId={usuarioId}
          vazio="Nenhum pedido para outra pessoa."
          mostrarQuemViaja
        />
      )}
    </>
  )
}

function TabelaViagens({
  titulo,
  icone,
  viagens,
  usuarioId,
  vazio,
  mostrarQuemViaja = false,
}: {
  titulo: string
  icone: React.ReactNode
  viagens: Viagem[]
  usuarioId: string
  vazio: string
  mostrarQuemViaja?: boolean
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
                  <TableHead className="hidden md:table-cell">
                    {mostrarQuemViaja ? "Quem viaja" : "Pedida por"}
                  </TableHead>
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
                      {mostrarQuemViaja
                        ? v.beneficiarioNome
                        : v.solicitanteId === usuarioId
                          ? "Você"
                          : (v.solicitanteNome ?? "—")}
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
