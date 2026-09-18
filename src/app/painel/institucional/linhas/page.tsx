import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Cpu, Smartphone, User } from "lucide-react"

import { CartaoEditavel } from "@/components/cartao-editavel"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  listarLinhasInstitucionais,
  opcoesResponsaveisLinha,
} from "@/lib/db/linhas-institucionais"
import { formatarTelefone } from "@/lib/formato"

import { AdicionarLinha, BotaoExcluirLinha, EditarLinha } from "./linhas-forms"

export const metadata: Metadata = { title: "Linhas institucionais — Confluir" }

const FILTRO =
  "border-input bg-background text-foreground h-9 w-80 max-w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function LinhasInstitucionaisPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>
}) {
  await requirePermissao("ferramentas_linhas_telefone", ["configuracoes"])

  const { busca = "" } = await searchParams
  const termo = busca.trim()
  const todas = await listarLinhasInstitucionais()
  const [linhas, responsaveis] = await Promise.all([
    termo ? listarLinhasInstitucionais(termo) : Promise.resolve(todas),
    opcoesResponsaveisLinha(todas),
  ])
  const comResponsavel = todas.filter((l) => l.usuarioId).length

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
          {todas.length} linha{todas.length === 1 ? "" : "s"}, {comResponsavel} com responsável
        </p>
      </div>

      <GrupoColapsavel titulo="Adicionar linha" descricao="Cadastre um número da entidade">
        <AdicionarLinha responsaveis={responsaveis} />
      </GrupoColapsavel>

      <form className="flex flex-wrap items-center gap-2" action="/painel/institucional/linhas">
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

      {linhas.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Smartphone className="mx-auto mb-2 size-5" />
              {termo
                ? "Nenhuma linha encontrada com esse filtro."
                : "Nenhuma linha institucional cadastrada ainda."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {linhas.map((l) => (
            <CartaoEditavel
              key={l.id}
              titulo={`${formatarTelefone(l.numero)}${l.operadora ? ` · ${l.operadora}` : ""}`}
              resumo={
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="flex items-center gap-1.5">
                      <User className="size-3.5" />
                      {l.responsavelNome ?? "Sem responsável"}
                    </span>
                    {l.chip && (
                      <span className="flex items-center gap-1.5 font-mono text-xs">
                        <Cpu className="size-3.5" />
                        {l.chip}
                      </span>
                    )}
                    {l.observacao && <span className="text-xs">{l.observacao}</span>}
                  </div>
                  <BotaoExcluirLinha id={l.id} numero={l.numero} />
                </div>
              }
            >
              <EditarLinha linha={l} responsaveis={responsaveis} />
            </CartaoEditavel>
          ))}
        </div>
      )}
    </>
  )
}
