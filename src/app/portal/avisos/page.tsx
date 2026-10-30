import type { Metadata } from "next"
import Link from "next/link"
import { BellOff, Settings2 } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { LembrarListaPortal } from "@/components/portal/voltar-portal"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { listaDeAvisos } from "@/lib/db/portal-avisos"
import { partesDesabilitadas } from "@/lib/db/portal-partes"
import { formatarDataHora } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"
import { EVENTOS_PORTAL, eventoDesabilitado } from "@/lib/portal-avisos-eventos"
import { cn } from "@/lib/utils"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { type ItemAviso, ListaAvisos } from "./lista-avisos"

export const metadata: Metadata = { title: "Avisos" }

/** Página dedicada à lista: 30 por página (DESIGN.md, "Tabelas longas"). */
const POR_PAGINA = 30

const ROTULO = new Map<string, string>(EVENTOS_PORTAL.map((e) => [e.chave, e.rotulo]))

/**
 * Sino do filiado (onda 4, F4). Abrir a lista não marca mais nada (A100):
 * quem marca é a própria lista, aviso a aviso, ou o "Marcar todos como
 * lidos" — ver lista-avisos.tsx. Filtro por tipo e paginação de 30, com os
 * não lidos no topo (A101). Aviso que leva a parte desabilitada na Área do
 * associado não aparece (listaDeAvisos), e o filtro do tipo dela some.
 */
export default async function PortalAvisosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const bruto = await searchParams
  const params: Record<string, string | undefined> = {}
  for (const [chave, valor] of Object.entries(bruto)) params[chave] = Array.isArray(valor) ? valor[0] : valor
  // Na dúvida (leitura falhou), todos os tipos valem.
  const desabilitadas = await partesDesabilitadas().catch(() => [])
  const tiposDoPortal = EVENTOS_PORTAL.filter((e) => !eventoDesabilitado(e.chave, desabilitadas))
  const tipo = tiposDoPortal.find((e) => e.chave === params.tipo)?.chave ?? null
  const paginacao = lerPaginacao(params, POR_PAGINA)
  const lista = await listaDeAvisos(filiado.cpf, { tipo, paginacao })

  const historico = [...lista.porTipo.values()].reduce((soma, t) => soma + t.total, 0)
  // Só os tipos que a pessoa tem no histórico; filtro de um tipo só não ajuda.
  const tipos = tiposDoPortal.filter((e) => lista.porTipo.has(e.chave))
  const mostraFiltros = tipos.length > 1 || tipo !== null
  const rotuloDoFiltro = tipo ? (ROTULO.get(tipo) ?? tipo) : null
  // O recorte da lista (tipo e paginação), sem o resto da URL.
  const recorte = new URLSearchParams()
  for (const chave of ["tipo", "pagina", "porPagina"]) {
    const valor = params[chave]
    if (valor) recorte.set(chave, valor)
  }
  const urlDaLista = recorte.toString() ? `/portal/avisos?${recorte}` : "/portal/avisos"

  const itens: ItemAviso[] = lista.avisos.map((a) => ({
    id: a.id,
    texto: a.texto,
    link: a.link,
    rotulo: ROTULO.get(a.evento) ?? a.evento,
    quando: formatarDataHora(a.criadoEm),
    criadoEm: a.criadoEm,
    lido: Boolean(a.lidaEm),
  }))

  return (
    <>
      {/* As Preferências voltam para a lista como estava (tipo, página). */}
      <LembrarListaPortal base="/portal/avisos" url={urlDaLista} />
      <CabecalhoPagina
        secao="/portal/avisos"
        titulo="Avisos"
        subtitulo={
          lista.naoLidos > 0
            ? `${lista.naoLidos} não lido${lista.naoLidos === 1 ? "" : "s"} · ${historico} no histórico`
            : historico > 0
              ? `${historico} no histórico`
              : "Reservas, cupons, inscrições e votações: o que é seu chega aqui."
        }
        acoes={
          <Button variant="outline" size="sm" asChild className="pointer-coarse:min-h-11">
            <Link href="/portal/avisos/preferencias">
              <Settings2 />
              Preferências de avisos
            </Link>
          </Button>
        }
      />

      {mostraFiltros && (
        <nav aria-label="Filtrar avisos por tipo" className="flex flex-wrap gap-2">
          <FiltroTipo href="/portal/avisos" ativo={tipo === null} rotulo="Todos" naoLidos={lista.naoLidos} />
          {tipos.map((e) => (
            <FiltroTipo
              key={e.chave}
              href={`/portal/avisos?tipo=${e.chave}`}
              ativo={tipo === e.chave}
              rotulo={e.rotulo}
              naoLidos={lista.porTipo.get(e.chave)?.naoLidos ?? 0}
            />
          ))}
        </nav>
      )}

      <Card>
        <CardContent className="grid gap-4">
          {itens.length === 0 ? (
            <EstadoVazio
              icone={BellOff}
              titulo={rotuloDoFiltro ? `Nenhum aviso de ${rotuloDoFiltro} por aqui.` : "Nenhum aviso por aqui ainda."}
              acao={
                rotuloDoFiltro && (
                  <Button variant="outline" size="sm" asChild className="pointer-coarse:min-h-11">
                    <Link href="/portal/avisos">Ver todos os avisos</Link>
                  </Button>
                )
              }
            />
          ) : (
            <>
              <ListaAvisos avisos={itens} naoLidos={lista.naoLidos} preview={preview} />
              {(lista.totalPaginas > 1 || paginacao.porPagina !== POR_PAGINA) && (
                <Paginacao
                  total={lista.total}
                  pagina={lista.pagina}
                  totalPaginas={lista.totalPaginas}
                  porPagina={paginacao.porPagina}
                  padrao={POR_PAGINA}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/** Um filtro por tipo: link (vale voltar e compartilhar), com os não lidos dele. */
function FiltroTipo({
  href,
  ativo,
  rotulo,
  naoLidos,
}: {
  href: string
  ativo: boolean
  rotulo: string
  naoLidos: number
}) {
  return (
    <Link scroll={false}
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={cn(buttonVariants({ variant: ativo ? "default" : "outline", size: "sm" }), "pointer-coarse:min-h-11")}
    >
      {rotulo}
      {naoLidos > 0 && (
        <span className={cn("tabular-nums font-semibold", !ativo && "text-primary")}>
          {naoLidos}
          <span className="sr-only"> não lido{naoLidos === 1 ? "" : "s"}</span>
        </span>
      )}
    </Link>
  )
}
