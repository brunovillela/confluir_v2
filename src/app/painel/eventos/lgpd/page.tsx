import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterConfig } from "@/lib/db/eventos"
import { listarPedidosLgpd, type PedidoLgpd } from "@/lib/db/eventos-config"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { BaixarPendencia as BaixarPendenciaBloco } from "./formulario"

export const metadata: Metadata = { title: "Pedidos de LGPD — Confluir" }

const ROTULO_TIPO: Record<string, string> = {
  exclusao: "Exclusão",
  correcao: "Correção",
  acesso: "Acesso",
  portabilidade: "Portabilidade",
  anonimizacao: "Anonimização",
}

function Pedido({
  pedido,
  sistema,
}: {
  pedido: PedidoLgpd
  sistema: string | null
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {ROTULO_TIPO[pedido.tipo] ?? pedido.tipo}
            </span>
            {pedido.acessoRemocaoPendente && (
              <Badge variant="destructive">remoção pendente</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {pedido.emailTitular ?? "(sem identificação)"}
          </p>
        </div>
        <p className="text-muted-foreground text-xs whitespace-nowrap">
          {formatarData(pedido.solicitadoEm)}
        </p>
      </div>

      <div className="text-muted-foreground mt-2 grid gap-1 text-xs">
        {pedido.registrosAnonimizados && (
          <p>{pedido.registrosAnonimizados} inscrição(ões) anonimizada(s).</p>
        )}
        {pedido.baseLegalRetencao && <p>{pedido.baseLegalRetencao}</p>}
        {pedido.observacao && <p>Motivo informado: {pedido.observacao}</p>}
        {pedido.acessoRemovidoEm && (
          <p>
            Removido do controle de acesso em{" "}
            {formatarDataHora(pedido.acessoRemovidoEm)}
            {pedido.acessoRemovidoPorNome
              ? ` por ${pedido.acessoRemovidoPorNome}`
              : ""}
            .
          </p>
        )}
      </div>

      {pedido.acessoRemocaoPendente && (
        <div className="mt-3 border-t pt-3">
          <BaixarPendenciaBloco
            pedidoId={pedido.id}
            sistema={sistema ?? "controle de acesso"}
          />
        </div>
      )}
    </div>
  )
}

export default async function LgpdEventosPage() {
  await requirePermissao("eventos_gestao")

  const [pedidos, { config }] = await Promise.all([
    listarPedidosLgpd(),
    obterConfig(),
  ])
  const pendentes = pedidos.filter((p) => p.acessoRemocaoPendente)
  const resto = pedidos.filter((p) => !p.acessoRemocaoPendente)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/eventos">
            <ArrowLeft />
            Eventos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Pedidos de LGPD
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          O que as pessoas pediram sobre os próprios dados em{" "}
          <span className="font-mono text-xs">/meus-dados</span>, e o que ainda
          falta a entidade executar.
        </p>
      </div>

      {pendentes.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            <strong>
              {pendentes.length} pessoa(s) pediram exclusão e ainda estão no{" "}
              {config.controle_acesso_nome ?? "sistema de controle de acesso"}.
            </strong>{" "}
            O Confluir já apagou o que era dele. A remoção lá é feita à mão, por
            alguém — enquanto não for, a entidade não cumpriu o pedido.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pendentes</CardTitle>
          <CardDescription>
            {pendentes.length === 0
              ? "Nada pendente — todo pedido foi executado até o fim."
              : "Marque como feito só depois de remover de verdade no outro sistema."}
          </CardDescription>
        </CardHeader>
        {pendentes.length > 0 && (
          <CardContent className="grid gap-3">
            {pendentes.map((p) => (
              <Pedido
                key={p.id}
                pedido={p}
                sistema={config.controle_acesso_nome}
              />
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>
            {resto.length === 0
              ? "Nenhum pedido registrado ainda."
              : `${resto.length} pedido(s). É a prova de que a entidade atendeu — guarde.`}
          </CardDescription>
        </CardHeader>
        {resto.length > 0 && (
          <CardContent className="grid gap-3">
            {resto.map((p) => (
              <Pedido
                key={p.id}
                pedido={p}
                sistema={config.controle_acesso_nome}
              />
            ))}
          </CardContent>
        )}
      </Card>

      <p className="text-muted-foreground text-xs">
        O e-mail de quem pediu exclusão continua aqui de propósito: sem ele
        ninguém consegue localizar a pessoa no sistema de controle de acesso
        para removê-la, e não haveria como provar que o pedido foi atendido. É
        retenção com finalidade declarada (LGPD art. 16, I).
      </p>
    </>
  )
}
