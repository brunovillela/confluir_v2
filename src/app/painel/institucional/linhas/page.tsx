import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Smartphone } from "lucide-react"

import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  listarLinhasInstitucionais,
  opcoesResponsaveisLinha,
} from "@/lib/db/linhas-institucionais"
import { formatarTelefone } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { AdicionarLinha } from "./linhas-forms"

export const metadata: Metadata = { title: "Linhas institucionais — Confluir" }

const FILTRO =
  "border-input bg-background text-foreground h-9 w-80 max-w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Disponibilidade: livre = sem responsável (na entidade); em uso = com alguém. */
const SITUACOES = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "disponiveis", rotulo: "Disponíveis" },
  { valor: "em_uso", rotulo: "Em uso" },
] as const
type Situacao = (typeof SITUACOES)[number]["valor"]

export default async function LinhasInstitucionaisPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; situacao?: string; removida?: string }>
}) {
  await requirePermissao("ferramentas_linhas_telefone", ["configuracoes"])

  const params = await searchParams
  const termo = (params.busca ?? "").trim()
  const situacao: Situacao = SITUACOES.some((s) => s.valor === params.situacao)
    ? (params.situacao as Situacao)
    : "todas"
  const todas = await listarLinhasInstitucionais()
  const [buscadas, responsaveis] = await Promise.all([
    termo ? listarLinhasInstitucionais(termo) : Promise.resolve(todas),
    opcoesResponsaveisLinha(todas),
  ])
  const comResponsavel = todas.filter((l) => l.usuarioId).length
  const contagem: Record<Situacao, number> = {
    todas: buscadas.length,
    disponiveis: buscadas.filter((l) => !l.usuarioId).length,
    em_uso: buscadas.filter((l) => l.usuarioId).length,
  }
  const linhas = buscadas.filter((l) =>
    situacao === "disponiveis" ? !l.usuarioId : situacao === "em_uso" ? Boolean(l.usuarioId) : true
  )
  const hrefSituacao = (s: Situacao) => {
    const q = new URLSearchParams()
    if (termo) q.set("busca", termo)
    if (s !== "todas") q.set("situacao", s)
    const qs = q.toString()
    return `/painel/institucional/linhas${qs ? `?${qs}` : ""}`
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Linhas institucionais</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Os celulares da entidade: número, operadora, chip e com quem cada linha está ·{" "}
          {todas.length} linha{todas.length === 1 ? "" : "s"}, {todas.length - comResponsavel}{" "}
          disponíve{todas.length - comResponsavel === 1 ? "l" : "is"}
        </p>
      </div>

      {params.removida && (
        <p className="border-success/40 bg-success/10 text-success-fg rounded-md border px-3 py-2 text-sm">
          Linha removida do cadastro.
        </p>
      )}

      <GrupoColapsavel titulo="Adicionar linha" descricao="Cadastre um número da entidade">
        <AdicionarLinha responsaveis={responsaveis} />
      </GrupoColapsavel>

      <div className="flex flex-wrap items-center gap-3">
      <form className="flex min-w-0 flex-wrap items-center gap-2" action="/painel/institucional/linhas">
        {situacao !== "todas" && <input type="hidden" name="situacao" value={situacao} />}
        <input
          type="search"
          name="busca"
          defaultValue={termo}
          placeholder="Número, chip, operadora ou pessoa"
          className={FILTRO}
        />
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>
        <nav aria-label="Disponibilidade" className="flex flex-wrap gap-1.5">
          {SITUACOES.map((s) => (
            <Button
              key={s.valor}
              asChild
              size="sm"
              variant={situacao === s.valor ? "default" : "outline"}
              className={cn("rounded-full", situacao !== s.valor && "text-muted-foreground")}
            >
              <Link href={hrefSituacao(s.valor)} aria-current={situacao === s.valor ? "page" : undefined}>
                {s.rotulo}
                <span className="tabular-nums opacity-80">{contagem[s.valor]}</span>
              </Link>
            </Button>
          ))}
        </nav>
      </div>

      {linhas.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Smartphone className="mx-auto mb-2 size-5" />
              {termo || situacao !== "todas"
                ? "Nenhuma linha encontrada com esse filtro."
                : "Nenhuma linha institucional cadastrada ainda."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={GRADE_AREAS}>
          {linhas.map((l) => (
            <CartaoArea
              key={l.id}
              titulo={formatarTelefone(l.numero)}
              descricao={l.responsavelNome ?? (l.usuarioId ? "(sem nome)" : "Na entidade")}
              href={`/painel/institucional/linhas/${l.id}`}
              icone={Smartphone}
              indicador={[l.operadora, l.observacao].filter(Boolean).join(" · ") || null}
              selo={
                l.usuarioId ? null : (
                  <Badge variant="outline" className="border-success/40 text-success-fg">
                    Disponível
                  </Badge>
                )
              }
            />
          ))}
        </div>
      )}
    </>
  )
}
