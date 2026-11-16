import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight, BellRing, PackageCheck } from "lucide-react"

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
import {
  listarFilaComprador,
  type ItemFilaComprador,
} from "@/lib/db/compras"
import { formatarData } from "@/lib/formato"
import { escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { listarNotasAReceber } from "@/lib/db/compras-marketplace"
import { preferenciasDeAviso } from "@/lib/db/avisos"
import { cotacaoForaDoPrazo, diasUteisDesde } from "@/lib/compras-prazo"
import { hojeSP } from "@/lib/db/comum"
import { lerComprasConfig } from "@/lib/db/compras-config"

import { PrazoCotacaoForm } from "./prazo-cotacao"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Área do comprador — Confluir" }

const ETAPAS = [
  {
    chave: "solicitada",
    titulo: "Solicitadas",
    descricao: "Aguardando o comprador abrir a cotação",
    acao: "Iniciar cotação",
  },
  {
    chave: "em_cotacao",
    titulo: "Em cotação",
    descricao: "Coletando propostas dos fornecedores",
    acao: "Ver cotação",
  },
  {
    chave: "cotada",
    titulo: "Cotadas — a comprar",
    descricao: "Cotação encerrada, aguardando a compra",
    acao: "Escolher e comprar",
  },
] as const

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}



function ItemProcesso({
  item,
  acao,
  mostrarEspera = false,
  prazo = null,
}: {
  item: ItemFilaComprador
  acao: string
  /** Solicitadas: quanto tempo esperam a cotação começar. */
  mostrarEspera?: boolean
  /** Prazo da entidade para iniciar a cotação (dias úteis; null = sem prazo). */
  prazo?: number | null
}) {
  const atrasado = item.data_limite ? item.data_limite < hoje() : false
  const criado = item.created_at?.slice(0, 10) ?? null
  const espera = mostrarEspera && criado ? diasUteisDesde(criado, hojeSP()) : null
  const foraDoPrazo = mostrarEspera && cotacaoForaDoPrazo(criado, hojeSP(), prazo)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          <Link
            href={`/painel/compras/${item.id}`}
            className="text-primary tabular-nums hover:underline"
          >
            {item.codigo ?? "(sem código)"}
          </Link>
          {item.produto && (
            <span className="text-foreground"> — {item.produto}</span>
          )}
        </p>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
          {item.departamentoNome && <span>{item.departamentoNome}</span>}
          {item.data_limite ? (
            <span className={atrasado ? "text-destructive font-medium" : ""}>
              {atrasado ? "prazo vencido em " : "receber até "}
              {formatarData(item.data_limite)}
            </span>
          ) : (
            <span>sem prazo</span>
          )}
          {espera !== null && (
            <span className={foraDoPrazo ? "text-warning-fg font-medium" : ""}>
              {espera === 0
                ? "solicitada hoje"
                : `esperando há ${espera} dia${espera === 1 ? "" : "s"} út${espera === 1 ? "il" : "eis"}`}
              {foraDoPrazo ? " · fora do prazo" : ""}
            </span>
          )}
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/painel/compras/${item.id}`}>
          {acao}
          <ArrowRight />
        </Link>
      </Button>
    </div>
  )
}

export default async function CompradorPage() {
  const sessao = await requirePermissao("aquisicoes_comprador", ["aquisicoes_compras_edicao"])
  const ehComprador = podeAcessar(sessao.permissoes, "aquisicoes_comprador")
  const [{ disponivel, itens }, notas, prefs] = await Promise.all([
    listarFilaComprador(),
    listarNotasAReceber(
      ehComprador ? null : await escopoComprasDoUsuario(sessao.usuario.id)
    ).catch(() => null),
    ehComprador ? preferenciasDeAviso(sessao.usuario.id).catch(() => null) : Promise.resolve(null),
  ])
  const config = await lerComprasConfig()
  // Quem ajusta o prazo: o comprador ou quem configura o sistema.
  const podeConfigurar = ehComprador || podeAcessar(sessao.permissoes, "configuracoes")
  // Avisos são opt-in: sem nenhum canal ligado, o comprador só vê a fila aqui.
  const semAvisoDeCotacao =
    !!prefs && !prefs.email.pendencia_cotacao && !prefs.telegram.pendencia_cotacao && !prefs.push.pendencia_cotacao
  const notasAReceber = notas?.itens.length ?? 0

  const porEtapa = (chave: string) =>
    itens.filter((i) => i.situacao === chave)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/compras">
            <ArrowLeft />
            Aquisição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Área do comprador
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Processos Via Aquisição que aguardam sua ação, da solicitação à compra.
        </p>
        <PrazoCotacaoForm prazo={config.prazoCotacao} podeEditar={podeConfigurar} />
      </div>

      {semAvisoDeCotacao && (
        <Alert>
          <BellRing />
          <AlertDescription>
            <span>
              Quer saber na hora quando chegar uma solicitação para cotar? Ligue{" "}
              <strong>Nova aquisição a cotar</strong> em{" "}
              <Link href="/painel/perfil/avisos" className="font-medium underline">
                Meu perfil → Avisos
              </Link>{" "}
              (e-mail, Telegram ou celular). O <strong>Lembrete diário</strong>, no mesmo lugar, traz a fila todo dia.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {notasAReceber > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <span>
              {notasAReceber} compra{notasAReceber === 1 ? "" : "s"} em marketplace aguardando a nota fiscal do
              vendedor —{" "}
              <Link href="/painel/compras/notas-a-receber" className="font-medium underline">
                ver Notas a receber
              </Link>
              .
            </span>
          </AlertDescription>
        </Alert>
      )}

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Rode <code>supabase/compras.sql</code> no Supabase para habilitar os
            processos de compra.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && itens.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-8 text-center text-sm">
              <PackageCheck className="mx-auto mb-2 size-5" />
              Nada na fila — nenhum processo Via Aquisição aguardando ação.
            </p>
          </CardContent>
        </Card>
      )}

      {ETAPAS.map((etapa) => {
        const lista = porEtapa(etapa.chave)
        if (lista.length === 0) return null
        return (
          <Card key={etapa.chave}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{etapa.titulo}</CardTitle>
                  <CardDescription>{etapa.descricao}</CardDescription>
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {lista.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2">
              {lista.map((item) => (
                <ItemProcesso
                  key={item.id}
                  item={item}
                  acao={etapa.acao}
                  mostrarEspera={etapa.chave === "solicitada"}
                  prazo={config.prazoCotacao}
                />
              ))}
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}
