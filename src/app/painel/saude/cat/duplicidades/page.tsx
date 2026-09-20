import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CopyCheck, Search, X } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Paginacao } from "@/components/paginacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { requirePermissao } from "@/lib/auth"
import { ROTULO_GRUPO_CAT, type TipoGrupoCat } from "@/lib/cat-classificacao"
import { listarGruposCat } from "@/lib/db/cat-duplicidades"
import { formatarDataHora } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { semAcento } from "@/lib/texto"

import { GrupoCatAcoes } from "./grupo-cat"

export const metadata: Metadata = { title: "CAT: duplicidades e atualizações — Confluir" }

const TIPOS: TipoGrupoCat[] = ["numero", "atualizacao", "acidente"]

const EXPLICACAO: Record<TipoGrupoCat, string> = {
  numero: "O mesmo número de CAT lançado mais de uma vez.",
  atualizacao:
    "Mesmo número-base com sequência diferente (…/01 e …/02): a /02 é reabertura ou óbito do mesmo acidente e ainda não está ligada à de origem.",
  acidente: "Mesmo acidentado e mesma data do acidente, com números diferentes: pode ser cópia ou atualização.",
}

/** CATs repetidas ou atualizações soltas, para tratar como em Filiados › Duplicidades. */
export default async function DuplicidadesCatPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; busca?: string; pagina?: string; porPagina?: string }>
}) {
  await requirePermissao("saude_cat", ["saude_gestao"])
  const brutos = await searchParams
  const tipo = TIPOS.includes(brutos.tipo as TipoGrupoCat) ? (brutos.tipo as TipoGrupoCat) : null
  const busca = (brutos.busca ?? "").trim()

  const dados = await listarGruposCat()
  const termo = semAcento(busca)
  const digitos = busca.replace(/\D/g, "")
  const filtrados = dados.grupos.filter((g) => {
    if (tipo && g.tipo !== tipo) return false
    if (!termo) return true
    return g.cats.some(
      (c) =>
        semAcento(c.nome ?? "").includes(termo) ||
        (digitos.length >= 4 && (c.numero ?? "").replace(/\D/g, "").includes(digitos))
    )
  })
  const paginacao = lerPaginacao(brutos, 20)
  const pagina = paginar(filtrados, paginacao)

  const url = (t: TipoGrupoCat | null) =>
    `/painel/saude/cat/duplicidades${t ? `?tipo=${t}` : ""}${busca ? `${t ? "&" : "?"}busca=${encodeURIComponent(busca)}` : ""}`

  return (
    <>
      <RotuloTrilha valores={{ duplicidades: "Duplicidades e atualizações" }} />
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/saude/cat">
            <ArrowLeft />
            CATs
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Duplicidades e atualizações</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          CATs lançadas mais de uma vez e atualizações (reabertura, óbito) que ainda não estão ligadas à CAT
          de origem. Marque a CAT que fica — ou a de origem — e escolha o que fazer. Descartar não apaga
          nada: a cópia sai das listas e pode ser restaurada na página da CAT que ficou.
        </p>
      </div>

      {!dados.disponivel && (
        <Alert>
          <AlertDescription>
            A área ainda não está configurada — rode <code>supabase/saude-cat-duplicidades.sql</code>.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={url(null)} className="group">
          <Card className={!tipo ? "border-primary/50" : "group-hover:border-primary/40"}>
            <CardContent className="grid gap-1">
              <span className="text-muted-foreground text-xs">Todos os grupos</span>
              <span className="text-2xl font-semibold tabular-nums">
                {dados.grupos.length.toLocaleString("pt-BR")}
              </span>
            </CardContent>
          </Card>
        </Link>
        {TIPOS.map((t) => (
          <Link key={t} href={url(t)} className="group">
            <Card className={tipo === t ? "border-primary/50" : "group-hover:border-primary/40"}>
              <CardContent className="grid gap-1">
                <span className="text-muted-foreground text-xs">{ROTULO_GRUPO_CAT[t]}</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {dados.totais[t].toLocaleString("pt-BR")}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {tipo && <p className="text-muted-foreground text-sm">{EXPLICACAO[tipo]}</p>}

      <form className="flex gap-2">
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <Input name="busca" defaultValue={busca} placeholder="Acidentado ou número da CAT" className="w-full sm:w-72" />
        <Button type="submit" variant="outline" size="icon" aria-label="Buscar">
          <Search />
        </Button>
        {(busca || tipo) && (
          <Button asChild variant="ghost" size="icon" title="Limpar">
            <Link href="/painel/saude/cat/duplicidades">
              <X />
            </Link>
          </Button>
        )}
      </form>

      {pagina.total === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <CopyCheck className="size-6" />
            {busca ? "Nenhum grupo encontrado na busca." : "Nada a tratar."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pagina.linhas.map((g) => (
            <Card key={`${g.tipo}:${g.chave}`}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline">{ROTULO_GRUPO_CAT[g.tipo]}</Badge>
                  <span className="text-muted-foreground text-xs">{EXPLICACAO[g.tipo]}</span>
                  {g.comObito && (
                    <Badge variant="outline" className="border-warning/40 text-warning-fg">
                      com óbito
                    </Badge>
                  )}
                  {g.pessoasDiferentes && (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">
                      acidentados diferentes — confira o número
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <GrupoCatAcoes tipo={g.tipo} chave={g.chave} cats={g.cats} />
              </CardContent>
            </Card>
          ))}
          <Paginacao
            total={pagina.total}
            pagina={pagina.pagina}
            totalPaginas={pagina.totalPaginas}
            porPagina={paginacao.porPagina}
            padrao={20}
          />
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        A varredura passa por todas as CATs não descartadas e fica guardada por 10 minutos. Última
        apuração: {formatarDataHora(dados.geradoEm)}.
      </p>
    </>
  )
}
