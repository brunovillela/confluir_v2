import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, CircleCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { buscarCat, filaConferenciaCat, urlPdfCat } from "@/lib/db/saude"
import { valoresDoRegistro } from "@/lib/saude-campos"

import { ConferenciaCat } from "./conferencia-cat"

export const metadata: Metadata = { title: "Conferir CATs — Confluir" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LISTA = "/painel/saude/cat?revisao=sem_conferencia"

/**
 * Conferência em fila das CATs gravadas sem conferência pelo lote de PDFs:
 * o PDF ao lado dos campos, uma CAT depois da outra. Não chama a IA — os
 * campos vêm da base e os avisos, de `leitura_avisos`.
 *
 * `?ids=` (do lote) fixa a fila; sem ele, entram todas as sem conferência.
 * `?desde=` marca o início da sessão, para as já conferidas continuarem
 * contando em "X de N". `?id=` é a CAT na tela.
 */
export default async function ConferirCatsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; id?: string; desde?: string; fim?: string }>
}) {
  await requirePermissao("saude_cat", ["saude_gestao"])
  const p = await searchParams

  const ids = p.ids
    ? [...new Set(p.ids.split(",").filter((x) => UUID.test(x)))].slice(0, 100)
    : undefined
  const desde = p.desde && !Number.isNaN(Date.parse(p.desde)) ? p.desde : null
  const endereco = (extra: Record<string, string>) => {
    const q = new URLSearchParams()
    if (ids?.length) q.set("ids", ids.join(","))
    q.set("desde", desde ?? new Date().toISOString())
    for (const [k, v] of Object.entries(extra)) q.set(k, v)
    return `/painel/saude/cat/conferir?${q}`
  }
  if (!desde) redirect(endereco(p.id && UUID.test(p.id) ? { id: p.id } : {}))

  const fila = await filaConferenciaCat({ ids, desde })
  const conferidas = fila.filter((i) => i.conferida).length
  const pendentes = fila.length - conferidas

  const indice = p.id ? fila.findIndex((i) => i.id === p.id) : fila.findIndex((i) => !i.conferida)
  if (fila.length === 0 || p.fim === "1" || indice < 0) {
    return (
      <>
        <Voltar />
        <Card>
          <CardContent className="grid justify-items-start gap-3">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <CircleCheck className="text-success-fg size-5" />
              {fila.length === 0
                ? "Nenhuma CAT sem conferência"
                : pendentes === 0
                  ? "Fila concluída"
                  : `${pendentes === 1 ? "Resta 1 CAT" : `Restam ${pendentes} CATs`} sem conferência`}
            </p>
            {fila.length > 0 && (
              <p className="text-muted-foreground text-sm">
                {conferidas} de {fila.length} {fila.length === 1 ? "CAT conferida" : "CATs conferidas"} nesta fila.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {pendentes > 0 && (
                <Button asChild>
                  <Link href={endereco({ id: fila.find((i) => !i.conferida)!.id })}>Continuar a conferência</Link>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href={LISTA}>Ver as CATs sem conferência</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    )
  }

  const atual = fila[indice]
  const cat = (await buscarCat(atual.id)) as Record<string, unknown> | null
  if (!cat) redirect(endereco({ fim: "1" }))

  // Depois de validar ou marcar pendência: a próxima ainda sem conferência,
  // na ordem da fila (dá a volta); sem nenhuma, a tela de fila concluída.
  const depois = [...fila.slice(indice + 1), ...fila.slice(0, indice)].find((i) => !i.conferida)

  return (
    <>
      <Voltar />
      <ConferenciaCat
        key={atual.id}
        id={atual.id}
        numero={(cat.numero_cat as string | null) ?? null}
        valores={valoresDoRegistro(cat)}
        avisos={Array.isArray(cat.leitura_avisos) ? (cat.leitura_avisos as string[]) : []}
        urlPdf={await urlPdfCat((cat.arquivo_url as string | null) ?? null)}
        pendencia={
          cat.conferencia_pendencia
            ? { motivo: cat.conferencia_pendencia as string, em: (cat.pendencia_em as string | null) ?? null }
            : null
        }
        conferida={atual.conferida}
        posicao={indice + 1}
        total={fila.length}
        conferidas={conferidas}
        hrefAnterior={indice > 0 ? endereco({ id: fila[indice - 1].id }) : null}
        hrefProxima={indice < fila.length - 1 ? endereco({ id: fila[indice + 1].id }) : null}
        hrefDepois={depois ? endereco({ id: depois.id }) : endereco({ fim: "1" })}
      />
    </>
  )
}

function Voltar() {
  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
        <Link href={LISTA}>
          <ArrowLeft />
          CATs sem conferência
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">Conferir CATs</h1>
    </div>
  )
}
