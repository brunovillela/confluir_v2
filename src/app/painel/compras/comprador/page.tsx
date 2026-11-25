import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight, BellRing, PackageCheck } from "lucide-react"

import { LembrarLista } from "@/components/voltar-lista"
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
import { semAcento } from "@/lib/texto"

import { PrazoCotacaoForm } from "./prazo-cotacao"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Área do comprador — Confluir" }

const FILTRO =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

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

export default async function CompradorPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; etapa?: string; departamento?: string; vencidos?: string }>
}) {
  const sp = await searchParams
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

  // Filtros (24/11/2026): busca por código ou produto (sem acento), etapa,
  // departamento e só os de prazo vencido. A fila lembra o recorte na aba.
  const busca = (sp.busca ?? "").trim()
  const etapa = ETAPAS.some((e) => e.chave === sp.etapa) ? sp.etapa! : ""
  const departamentos = [...new Set(itens.map((i) => i.departamentoNome).filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b, "pt-BR")
  )
  const departamento = departamentos.includes(sp.departamento ?? "") ? sp.departamento! : ""
  const vencidos = sp.vencidos === "1"
  const termo = semAcento(busca.toLowerCase())
  const filtrados = itens.filter(
    (i) =>
      (!etapa || i.situacao === etapa) &&
      (!departamento || i.departamentoNome === departamento) &&
      (!vencidos || Boolean(i.data_limite && i.data_limite < hoje())) &&
      (!termo || semAcento(`${i.codigo ?? ""} ${i.produto ?? ""}`.toLowerCase()).includes(termo))
  )
  const temFiltro = Boolean(busca || etapa || departamento || vencidos)
  const q = new URLSearchParams()
  if (busca) q.set("busca", busca)
  if (etapa) q.set("etapa", etapa)
  if (departamento) q.set("departamento", departamento)
  if (vencidos) q.set("vencidos", "1")
  const urlAtual = `/painel/compras/comprador${q.size ? `?${q}` : ""}`

  const porEtapa = (chave: string) =>
    filtrados.filter((i) => i.situacao === chave)

  return (
    <>
      <LembrarLista chave="compras-lista" url={urlAtual} />
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

      {disponivel && itens.length > 0 && (
        <form action="/painel/compras/comprador" className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="busca"
            defaultValue={busca}
            placeholder="Código ou produto/serviço"
            aria-label="Buscar por código ou produto/serviço"
            className={`${FILTRO} w-64 max-w-full`}
          />
          <select name="etapa" defaultValue={etapa} aria-label="Etapa" className={FILTRO}>
            <option value="">Todas as etapas</option>
            {ETAPAS.map((e) => (
              <option key={e.chave} value={e.chave}>
                {e.titulo}
              </option>
            ))}
          </select>
          {departamentos.length > 1 && (
            <select name="departamento" defaultValue={departamento} aria-label="Departamento" className={FILTRO}>
              <option value="">Todos os departamentos</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          <label className="border-input flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
            <input type="checkbox" name="vencidos" value="1" defaultChecked={vencidos} className="accent-primary size-4" />
            Prazo vencido
          </label>
          <Button type="submit" variant="outline" size="sm" className="h-9">
            Filtrar
          </Button>
          {temFiltro && (
            <>
              <Button variant="ghost" size="sm" className="h-9" asChild>
                <Link href="/painel/compras/comprador">Limpar</Link>
              </Button>
              <span className="text-muted-foreground text-xs">
                {filtrados.length} de {itens.length} processo{itens.length === 1 ? "" : "s"}
              </span>
            </>
          )}
        </form>
      )}

      {disponivel && itens.length > 0 && filtrados.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-8 text-center text-sm">Nenhum processo da fila com estes filtros.</p>
          </CardContent>
        </Card>
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
