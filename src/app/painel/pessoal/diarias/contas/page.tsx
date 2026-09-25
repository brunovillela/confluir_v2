import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import {
  centrosDeCustoDespesa,
  contaDoGasto,
  listarContasDiaria,
  listarTiposDespesaDiaria,
  ROTULO_QUADRO,
  tiposDeViagem,
  type QuadroConta,
} from "@/lib/db/diarias-config"
import { listarDepartamentosCompletos } from "@/lib/db/departamentos"

import { ContasDoQuadro, NovoTipoDespesa, type GastoParaConta } from "./contas-forms"

export const metadata: Metadata = { title: "Contas das diárias — Confluir" }

/**
 * De-para das contas contábeis das diárias. O plano de contas da entidade
 * separa por quadro E por departamento ("Deslocamento Diretores" existe em
 * cada área), então é aqui que se diz qual conta cada gasto usa.
 */
export default async function ContasDiariaPage({
  searchParams,
}: {
  searchParams: Promise<{ quadro?: string; departamento?: string }>
}) {
  await requirePermissao("pessoal_gestao", [
    "pessoal_diarias",
    "diretoria_diarias",
    "viagens_gestao",
    "configuracoes",
  ])

  const brutos = await searchParams
  const quadro: QuadroConta =
    brutos.quadro === "diretor" || brutos.quadro === "convidado" ? brutos.quadro : "funcionario"
  const departamentoId = (brutos.departamento ?? "").trim() || null

  const [{ disponivel, tipos }, { contas }, centros, departamentos] = await Promise.all([
    listarTiposDespesaDiaria(),
    listarContasDiaria(),
    centrosDeCustoDespesa(),
    listarDepartamentosCompletos(),
  ])
  const nomeCentro = new Map(centros.map((c) => [c.id, c.nome]))
  const nomeDepartamento = new Map(departamentos.map((d) => [d.id, d.nome]))

  // Convidado não recebe diária: só passagem e hospedagem, que saem por Viagens.
  const deViagem = tiposDeViagem(tipos)
  const ativos = tipos.filter((t) => t.ativa)
  const gastos: GastoParaConta[] = (
    quadro === "convidado"
      ? ativos
          .filter((t) => t.id === deViagem.passagem || t.id === deViagem.hospedagem)
          .map((t) => ({ chave: t.id, rotulo: t.nome, tipoId: t.id as string | null }))
      : [
          { chave: "diaria", rotulo: "A diária", tipoId: null as string | null },
          ...ativos.map((t) => ({ chave: t.id, rotulo: t.nome, tipoId: t.id as string | null })),
        ]
  ).map(({ chave, rotulo, tipoId }) => {
    const exata = contas.find(
      (c) =>
        c.quadro === quadro &&
        (c.departamentoId ?? null) === departamentoId &&
        (c.despesaTipoId ?? null) === tipoId
    )
    // Sem conta própria, mostra de onde herdaria.
    const herdada = departamentoId ? contaDoGasto(contas, quadro, null, tipoId) : null
    return {
      chave,
      rotulo,
      contaAtual: exata?.centroCustoId ?? null,
      herdadaDe: herdada ? (nomeCentro.get(herdada) ?? "conta padrão") : null,
    }
  })

  const opcoes = centros.map((c) => ({
    id: c.id,
    nome: c.nome,
    classificador: c.classificador,
    grupo: c.departamentoId
      ? (nomeDepartamento.get(c.departamentoId) ?? "Outros")
      : "Sem departamento",
  }))

  const doQuadro = contas.filter((c) => c.quadro === quadro)

  return (
    <>
      <RotuloTrilha valores={{ contas: "Centros de custo" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/diarias">
            <ArrowLeft />
            Diárias
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Centros de custo das diárias</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          A conta sai de três coisas: o quadro de quem recebe, o departamento que banca e o tipo
          de gasto. Sem conta definida, a ordem de pagamento vai para o financeiro classificar.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            Rode <code>supabase/diarias-diretoria.sql</code> no SQL Editor do Supabase para
            liberar as despesas extras e o de-para das contas.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {(["funcionario", "diretor", "convidado"] as const).map((q) => (
          <Button
            key={q}
            size="sm"
            variant={quadro === q ? "default" : "outline"}
            asChild
          >
            <Link href={`/painel/pessoal/diarias/contas?quadro=${q}`}>{ROTULO_QUADRO[q]}</Link>
          </Button>
        ))}
      </div>

      {quadro !== "funcionario" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={departamentoId ? "outline" : "secondary"} asChild>
            <Link href={`/painel/pessoal/diarias/contas?quadro=${quadro}`}>Padrão</Link>
          </Button>
          {departamentos
            .filter((d) => !d.legado)
            .map((d) => {
              const definidas = doQuadro.filter((c) => c.departamentoId === d.id).length
              return (
                <Button
                  key={d.id}
                  size="sm"
                  variant={departamentoId === d.id ? "secondary" : "outline"}
                  asChild
                >
                  <Link href={`/painel/pessoal/diarias/contas?quadro=${quadro}&departamento=${d.id}`}>
                    {d.nome}
                    {definidas > 0 && (
                      <Badge variant="outline" className="ml-1.5">
                        {definidas}
                      </Badge>
                    )}
                  </Link>
                </Button>
              )
            })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {ROTULO_QUADRO[quadro]}
            {departamentoId ? ` — ${nomeDepartamento.get(departamentoId) ?? "departamento"}` : " — padrão"}
          </CardTitle>
          <CardDescription>
            {quadro === "diretor"
              ? "Cada departamento tem as contas dele; o padrão vale para quem não tiver conta própria."
              : quadro === "convidado"
                ? "Passagem e hospedagem de convidados de evento, pagas por Viagens. O departamento é o que banca a viagem; o padrão vale para quem não tiver conta própria."
                : "Os funcionários usam uma conta só, sem separação por departamento."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContasDoQuadro
            quadro={quadro}
            departamentoId={departamentoId}
            gastos={gastos}
            contas={opcoes}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tipos de despesa extra</CardTitle>
          <CardDescription>
            O que pode acompanhar uma diária. Cada tipo tem conta própria, definida acima.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {tipos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum tipo cadastrado.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {tipos.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t.nome}
                    {t.descricao && (
                      <span className="text-muted-foreground"> — {t.descricao}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {t.exigeComprovante && (
                      <Badge variant="outline" className="text-muted-foreground">
                        comprovante
                      </Badge>
                    )}
                    {!t.ativa && (
                      <Badge variant="outline" className="text-muted-foreground">
                        inativo
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <NovoTipoDespesa />
        </CardContent>
      </Card>
    </>
  )
}
