import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarDias, obterEvento } from "@/lib/db/eventos"
import { ajustesDePresenca, diaLancavel, pessoasDoDia } from "@/lib/db/eventos-presencas-manual"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { ListaPresencas } from "./lista-presencas"

export const metadata: Metadata = { title: "Lançar presenças — Confluir" }

/** Muda quando as presenças do dia mudam: remonta a lista depois de salvar. */
function assinatura(ids: string[]): string {
  let h = 0
  for (const s of ids) for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return `${ids.length}-${h}`
}

export default async function PresencasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ dia?: string }>
}) {
  await requirePermissao("eventos_gestao")
  const { id } = await params
  const { dia: diaParam } = await searchParams

  const evento = await obterEvento(id)
  if (!evento) notFound()

  const dias = await listarDias(id)
  const lancaveis = dias.filter(diaLancavel)
  // Sem dia escolhido: o último que já chegou (o caso comum é "o evento de ontem").
  const dia = dias.find((d) => d.id === diaParam) ?? lancaveis[lancaveis.length - 1] ?? null
  const podeLancar = !!dia && diaLancavel(dia)

  const [pessoas, ajustes] = await Promise.all([
    dia && podeLancar ? pessoasDoDia(id, dia.id) : Promise.resolve([]),
    ajustesDePresenca(id),
  ])
  const rotuloDia = (d: { data: string; rotulo: string | null }) =>
    `${formatarData(d.data)}${d.rotulo ? ` — ${d.rotulo}` : ""}`

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href={`/painel/eventos/${id}`}>
            <ArrowLeft />
            {evento.titulo ?? "Evento"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Lançar presenças</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Para registrar depois quem veio — a partir da lista de assinatura em papel, por
          exemplo — ou retirar uma presença marcada por engano. A presença lançada aqui fica
          como &ldquo;lançada depois&rdquo;, com quem lançou e quando.
        </p>
      </div>

      {dias.length === 0 && (
        <Alert variant="warning">
          <AlertDescription>
            O evento não tem dias definidos. Confira o início e o término em Editar.
          </AlertDescription>
        </Alert>
      )}

      {dias.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Dia do evento">
          {dias.map((d) => {
            const ativo = d.id === dia?.id
            return diaLancavel(d) ? (
              <Button key={d.id} asChild size="sm" variant={ativo ? "default" : "outline"}>
                <Link href={`/painel/eventos/${id}/presencas?dia=${d.id}`} aria-current={ativo ? "page" : undefined}>
                  {rotuloDia(d)}
                </Link>
              </Button>
            ) : (
              <Button key={d.id} size="sm" variant="outline" disabled title="Esse dia ainda não chegou">
                {rotuloDia(d)}
              </Button>
            )
          })}
        </div>
      )}

      {dia && !podeLancar && (
        <Alert variant="info">
          <AlertDescription>
            {rotuloDia(dia)} ainda não chegou. A presença se lança no dia do evento ou depois.
          </AlertDescription>
        </Alert>
      )}

      {dia && podeLancar && (
        <Card>
          <CardHeader>
            <CardTitle>{rotuloDia(dia)}</CardTitle>
            <CardDescription>
              Os confirmados e quem já tem presença nesse dia. Pendentes, recusados e a lista
              de espera não recebem presença — confirme a inscrição antes, na página do evento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pessoas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum inscrito confirmado neste evento.</p>
            ) : (
              <ListaPresencas
                key={`${dia.id}:${assinatura(pessoas.filter((p) => p.presente).map((p) => p.inscricaoId))}`}
                eventoId={id}
                diaId={dia.id}
                pessoas={pessoas}
              />
            )}
          </CardContent>
        </Card>
      )}

      {ajustes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lançadas e retiradas à mão</CardTitle>
            <CardDescription>As últimas {ajustes.length}, da mais recente.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-1.5 text-sm">
              {ajustes.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.nome ?? "(inscrição removida)"}</span>
                  {" — "}
                  {a.acao === "lancou" ? "presença lançada" : "presença retirada"}
                  {a.dia ? ` em ${formatarData(a.dia)}` : ""}
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatarDataHora(a.em)}
                    {a.usuarioNome ? `, por ${a.usuarioNome}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </>
  )
}
