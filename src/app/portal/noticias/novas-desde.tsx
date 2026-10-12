"use client"

import { createContext, useContext, useEffect, useSyncExternalStore } from "react"

import { Badge } from "@/components/ui/badge"

/**
 * "Novas desde a sua última visita" (A123), sem custo de banco: a data da
 * notícia mais recente que a pessoa já viu fica no navegador (localStorage —
 * por endereço, e cada entidade tem o seu subdomínio). A referência da
 * visita fica na sessão da aba (sessionStorage): recarregar a página não
 * apaga os selos; eles somem na visita seguinte. Na primeira visita nada é
 * "nova". Navegador que bloqueia o armazenamento (aba anônima, dados limpos)
 * só fica sem os selos. Na visualização pela gestão (`ativo` falso) nada é
 * lido nem gravado: o navegador é o do atendente.
 */

const VISTAS_ATE = "confluir:portal:noticias:vistas-ate"
const NOVAS_DESDE = "confluir:portal:noticias:novas-desde"

function ler(onde: "local" | "sessao", chave: string): string | null {
  try {
    return (onde === "local" ? window.localStorage : window.sessionStorage).getItem(chave)
  } catch {
    return null
  }
}

function gravar(onde: "local" | "sessao", chave: string, valor: string): void {
  try {
    ;(onde === "local" ? window.localStorage : window.sessionStorage).setItem(chave, valor)
  } catch {
    // Armazenamento bloqueado: segue sem os selos.
  }
}

const semInscricao = () => () => {}

/** Instante (ms) de uma data ISO; null se não for data. */
function instante(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** Instante de referência da visita; null no servidor, desligado ou na primeira visita (nada é novo). */
const Contexto = createContext<number | null>(null)

export function NovasDesde({
  maisRecente,
  ativo,
  children,
}: {
  /** Data da notícia mais recente da entidade. */
  maisRecente: string | null
  ativo: boolean
  children: React.ReactNode
}) {
  // A referência da visita: a da sessão, se a aba já passou por aqui; senão,
  // o "vistas até" de antes — o mesmo valor que o efeito abaixo guarda na
  // sessão. "" = primeira visita.
  const desde = useSyncExternalStore(
    semInscricao,
    () => (ativo ? (ler("sessao", NOVAS_DESDE) ?? ler("local", VISTAS_ATE) ?? "") : null),
    () => null
  )

  useEffect(() => {
    if (!ativo) return
    if (ler("sessao", NOVAS_DESDE) === null) gravar("sessao", NOVAS_DESDE, ler("local", VISTAS_ATE) ?? "")
    const nova = instante(maisRecente)
    const vista = instante(ler("local", VISTAS_ATE))
    if (nova !== null && (vista === null || nova > vista)) gravar("local", VISTAS_ATE, new Date(nova).toISOString())
  }, [ativo, maisRecente])

  return <Contexto.Provider value={desde ? instante(desde) : null}>{children}</Contexto.Provider>
}

function useNova(criadoEm: string | null | undefined): boolean {
  const desde = useContext(Contexto)
  const t = instante(criadoEm)
  return desde !== null && t !== null && t > desde
}

/** Selo "Nova" ao lado da data da notícia. */
export function MarcaNova({ criadoEm }: { criadoEm: string | null }) {
  return useNova(criadoEm) ? <Badge className="shrink-0">Nova</Badge> : null
}

/** "2 novas desde a sua última visita" — nada quando não há. */
export function ContagemNovas({ datas }: { datas: (string | null)[] }) {
  const desde = useContext(Contexto)
  if (desde === null) return null
  const n = datas.filter((d) => {
    const t = instante(d)
    return t !== null && t > desde
  }).length
  if (n === 0) return null
  return (
    <span className="text-primary font-medium">
      {" "}
      {n} {n === 1 ? "nova" : "novas"} desde a sua última visita.
    </span>
  )
}
