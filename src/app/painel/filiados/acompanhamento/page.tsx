import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  UserRoundMinus,
  UserRoundPlus,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  carregarAcompanhamento,
  type EtapaAcompanhamento,
} from "@/lib/db/filiacao-etapas"
import { proximaCondicao } from "@/lib/filiacao"
import { formatarCpf } from "@/lib/cpf"

import { avancarEtapa } from "./actions"

export const metadata: Metadata = {
  title: "Acompanhamento de filiações — Confluir",
}

/** Rótulo curto da condição para os cabeçalhos de etapa e botões. */
const ROTULO_CURTO: Record<string, string> = {
  "Aguarda ficha assinada": "Aguardando ficha",
  "Filiação não informada à fonte": "A informar à fonte",
  "Filiação aguarda fonte": "Aguardando fonte",
  Ativo: "Ativo",
  "Desfiliação não informada à fonte": "A informar à fonte",
  "Desfiliação aguarda fonte": "Aguardando fonte",
  Inativo: "Inativo",
}

function tempoParado(iso: string | null): string {
  if (!iso) return "sem data"
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return "hoje"
  if (dias === 1) return "há 1 dia"
  if (dias < 30) return `há ${dias} dias`
  const meses = Math.floor(dias / 30)
  if (meses < 12) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`
  const anos = Math.floor(dias / 365)
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}`
}

function ColunaEtapa({ etapa }: { etapa: EtapaAcompanhamento }) {
  const proxima = proximaCondicao(etapa.condicao)
  const rotuloProxima = proxima ? (ROTULO_CURTO[proxima] ?? proxima) : null
  const restante = etapa.total - etapa.filiados.length

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">
            {ROTULO_CURTO[etapa.condicao] ?? etapa.condicao}
          </CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {etapa.total.toLocaleString("pt-BR")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {etapa.filiados.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-xs">
            Ninguém nesta etapa.
          </p>
        ) : (
          etapa.filiados.map((f) => (
            <div
              key={f.id}
              className="grid gap-1.5 rounded-lg border p-2.5 text-sm"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <Link
                  href={`/painel/filiados/${f.id}`}
                  className="min-w-0 font-medium break-words hover:underline"
                >
                  {f.nome_completo ?? "(sem nome)"}
                </Link>
                <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                  {tempoParado(f.condicao_desde)}
                </span>
              </div>
              <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono">
                  {f.cpf
                    ? formatarCpf(f.cpf)
                    : f.matricula_sindical
                      ? `mat. ${f.matricula_sindical}`
                      : "—"}
                </span>
                {proxima && (
                  <form action={avancarEtapa}>
                    <input type="hidden" name="filiado_id" value={f.id} />
                    <input
                      type="hidden"
                      name="redirect_to"
                      value="/painel/filiados/acompanhamento"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      title={`Avançar para "${proxima}"`}
                    >
                      {rotuloProxima}
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
        {restante > 0 && (
          <Button variant="ghost" size="sm" asChild className="justify-center">
            <Link
              href={`/painel/filiados/lista?condicao=${encodeURIComponent(
                etapa.condicao
              )}&situacao=todas`}
            >
              Ver todos ({etapa.total.toLocaleString("pt-BR")})
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function Faixa({
  titulo,
  descricao,
  icone: Icone,
  etapas,
  colunas,
}: {
  titulo: string
  descricao: string
  icone: typeof UserRoundPlus
  etapas: EtapaAcompanhamento[]
  colunas: string
}) {
  const total = etapas.reduce((s, e) => s + e.total, 0)
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2">
        <Icone className="text-muted-foreground size-5" />
        <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
        <Badge variant="outline" className="tabular-nums">
          {total.toLocaleString("pt-BR")} em andamento
        </Badge>
      </div>
      <p className="text-muted-foreground -mt-1 text-xs">{descricao}</p>
      <div className={`grid gap-3 ${colunas}`}>
        {etapas.map((e) => (
          <ColunaEtapa key={e.condicao} etapa={e} />
        ))}
      </div>
    </section>
  )
}

export default async function AcompanhamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ etapa?: string }>
}) {
  await requirePermissao("filiacao_gestao")
  const { etapa } = await searchParams
  const dados = await carregarAcompanhamento()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Acompanhamento de filiações
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Onde cada processo de filiação e de desfiliação está parado. Avance a
          etapa quando a fonte for informada; Ativo/Inativo também saem da
          conferência da remessa.
        </p>
      </div>

      {etapa === "ok" && (
        <Alert className="border-success/40 text-success-fg">
          <CircleCheck />
          <AlertDescription>Etapa avançada.</AlertDescription>
        </Alert>
      )}
      {etapa === "fim" && (
        <Alert variant="warning">
          <AlertDescription>
            Este cadastro já está no estágio final do processo.
          </AlertDescription>
        </Alert>
      )}
      {etapa === "erro" && (
        <Alert variant="warning">
          <AlertDescription>
            Não foi possível avançar a etapa. Tente novamente.
          </AlertDescription>
        </Alert>
      )}

      <Faixa
        titulo="Processo de filiação"
        descricao="Da assinatura da ficha ao início dos descontos (Ativo)."
        icone={UserRoundPlus}
        etapas={dados.filiacao}
        colunas="sm:grid-cols-2 xl:grid-cols-3"
      />

      <Faixa
        titulo="Processo de desfiliação"
        descricao="Da carta de desfiliação ao fim dos descontos (Inativo)."
        icone={UserRoundMinus}
        etapas={dados.desfiliacao}
        colunas="sm:grid-cols-2"
      />
    </>
  )
}
