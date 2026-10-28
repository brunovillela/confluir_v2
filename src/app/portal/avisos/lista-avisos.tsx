"use client"

import Link from "next/link"
import { useActionState, useCallback, useEffect, useRef, useState } from "react"
import { CheckCheck, Loader2 } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { AvisosLidos } from "@/components/portal/contador-avisos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { type EstadoMarcarTodos, marcarAvisosLidosAction, marcarTodosAvisosLidosAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export type ItemAviso = {
  id: string
  texto: string
  link: string | null
  /** Nome do tipo (Hospedagem, Votações…). */
  rotulo: string
  /** Data e hora já formatadas no fuso de São Paulo. */
  quando: string
  criadoEm: string
  lido: boolean
}

/**
 * Espera entre o aviso sem link aparecer na tela e a gravação de "lido":
 * junta os que aparecem juntos (a primeira tela, uma rolagem) num pedido só.
 */
const ESPERA_MS = 1500

/**
 * A lista de Avisos (A100). Ninguém marca nada só por abrir a página:
 *  - aviso COM link vira lido quando a pessoa o abre;
 *  - aviso SEM link (não tem para onde levar) vira lido depois de aparecer
 *    na tela — os de baixo da dobra esperam a rolagem;
 *  - "Marcar todos como lidos" resolve o resto de uma vez.
 * O selo "Novo" vale para a visita: o que chegou não lido continua
 * destacado depois de marcado, até a pessoa sair da página ou marcar todos.
 * Na visualização pela gestão nada é marcado.
 */
export function ListaAvisos({
  avisos,
  naoLidos,
  preview,
}: {
  avisos: ItemAviso[]
  /** Não lidos de todos os tipos (o número do sino). */
  naoLidos: number
  preview: boolean
}) {
  const [novosDaVisita, setNovosDaVisita] = useState(() => new Set(avisos.filter((a) => !a.lido).map((a) => a.id)))
  // Outra página ou outro filtro (ou um aviso que chegou): os não lidos que
  // aparecem agora também ficam destacados até o fim da visita.
  const [vistos, setVistos] = useState(avisos)
  if (vistos !== avisos) {
    setVistos(avisos)
    const chegaram = avisos.filter((a) => !a.lido && !novosDaVisita.has(a.id))
    if (chegaram.length > 0) setNovosDaVisita(new Set([...novosDaVisita, ...chegaram.map((a) => a.id)]))
  }

  const [estado, marcarTodos, marcando] = useActionState(async (): Promise<EstadoMarcarTodos> => {
    const r = await marcarTodosAvisosLidosAction()
    if (r.ok) setNovosDaVisita(new Set())
    return r
  }, {})
  const envio = useEnvioFormulario(marcarTodos, estado)

  // ── Lido ao aparecer na tela (avisos sem link) ──────────────────────────────
  const lista = useRef<HTMLDivElement>(null)
  const pendentes = useRef(new Set<string>())
  const enviados = useRef(new Set<string>())
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enviar = useCallback(() => {
    relogio.current = null
    const ids = [...pendentes.current]
    pendentes.current.clear()
    if (ids.length > 0) marcarAvisosLidosAction(ids).catch(() => {})
  }, [])

  useEffect(() => {
    if (preview || typeof IntersectionObserver === "undefined") return
    const alvos = lista.current?.querySelectorAll<HTMLElement>("[data-ler-ao-ver]")
    if (!alvos || alvos.length === 0) return
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue
          observador.unobserve(e.target)
          const id = (e.target as HTMLElement).dataset.lerAoVer
          if (!id || enviados.current.has(id)) continue
          enviados.current.add(id)
          pendentes.current.add(id)
        }
        if (pendentes.current.size > 0 && !relogio.current) relogio.current = setTimeout(enviar, ESPERA_MS)
      },
      { threshold: 0.6 }
    )
    alvos.forEach((el) => observador.observe(el))
    return () => observador.disconnect()
  }, [avisos, preview, enviar])

  // Saiu da página antes do tempo: o que já apareceu conta como visto.
  useEffect(() => {
    const fila = pendentes.current
    return () => {
      if (relogio.current) clearTimeout(relogio.current)
      relogio.current = null
      if (fila.size > 0) {
        const ids = [...fila]
        fila.clear()
        marcarAvisosLidosAction(ids).catch(() => {})
      }
    }
  }, [])

  /**
   * Aviso com link: lido ao abrir. A navegação segue; a action termina
   * sozinha. O destaque fica, como o dos vistos na tela: aberto numa aba nova
   * (Ctrl+clique), o item não pula de seção debaixo do cursor.
   */
  function abrir(a: ItemAviso) {
    if (preview || a.lido) return
    marcarAvisosLidosAction([a.id]).catch(() => {})
  }

  const ehNovo = (a: ItemAviso) => !a.lido || novosDaVisita.has(a.id)
  // O servidor decide o que entra na página (não lidos e lidos há pouco no
  // topo); dentro de cada seção vale só a data, para o item que a pessoa
  // acabou de ler não trocar de lugar quando a lista recarrega.
  const porData = (a: ItemAviso, b: ItemAviso) => (Date.parse(b.criadoEm) || 0) - (Date.parse(a.criadoEm) || 0)
  const novos = avisos.filter(ehNovo).sort(porData)
  const anteriores = avisos.filter((a) => !ehNovo(a)).sort(porData)
  const temOQueMarcar = naoLidos > 0 || novos.length > 0

  function item(a: ItemAviso) {
    const novo = ehNovo(a)
    const conteudo = (
      <>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", novo ? "font-semibold" : "font-normal")}>{a.texto}</span>
          <span className="text-muted-foreground mt-0.5 block text-xs">
            {a.rotulo} · <time dateTime={a.criadoEm}>{a.quando}</time>
          </span>
        </span>
        {novo && <Badge className="shrink-0">Novo</Badge>}
      </>
    )
    const classes = cn(
      "-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-3",
      novo && "bg-primary/5 border-l-primary border-l-2",
      a.link && "hover:bg-muted/40 transition-colors"
    )
    return (
      <li key={a.id}>
        {a.link ? (
          <Link href={a.link} className={classes} onClick={() => abrir(a)}>
            {conteudo}
          </Link>
        ) : (
          <div className={classes} data-ler-ao-ver={a.lido ? undefined : a.id}>
            {conteudo}
          </div>
        )}
      </li>
    )
  }

  return (
    <div ref={lista} className="grid gap-4">
      {(temOQueMarcar || estado.ok || estado.erro) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-muted-foreground text-xs">
            {estado.ok && !temOQueMarcar ? "Pronto: todos os avisos estão lidos." : ""}
          </p>
          {temOQueMarcar && (
            <form {...formVisualizacao(preview, marcarTodos)} {...(preview ? {} : envio)}>
              <AcaoVisualizacao preview={preview} nota="Só o próprio associado marca os avisos como lidos.">
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={marcando}
                  className="pointer-coarse:min-h-11"
                >
                  {marcando ? <Loader2 className="animate-spin" /> : <CheckCheck />}
                  Marcar todos como lidos
                </Button>
              </AcaoVisualizacao>
            </form>
          )}
          {estado.erro && (
            <p role="alert" className="text-destructive w-full text-xs">
              {estado.erro}
            </p>
          )}
        </div>
      )}
      {/* O selo do sino zera na hora, sem esperar a casca recarregar. */}
      {estado.ok && <AvisosLidos />}

      {novos.length > 0 && (
        <section aria-labelledby="avisos-novos" className="grid gap-1">
          <h2 id="avisos-novos" className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Novos
          </h2>
          <ul className="divide-y">{novos.map(item)}</ul>
        </section>
      )}
      {anteriores.length > 0 && (
        <section aria-labelledby="avisos-anteriores" className="grid gap-1">
          {/* Sem novos na página, o título "Anteriores" sobra. */}
          {novos.length > 0 ? (
            <h2 id="avisos-anteriores" className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Anteriores
            </h2>
          ) : (
            <h2 id="avisos-anteriores" className="sr-only">
              Avisos
            </h2>
          )}
          <ul className="divide-y">{anteriores.map(item)}</ul>
        </section>
      )}
    </div>
  )
}
