import Link from "next/link"
import { Pencil } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ConferenciaFuncionario } from "@/lib/db/ponto-marcacoes"

import { ConferirDiaBotao } from "../funcionario/[usuarioId]/[registroId]/marcacoes-edicao"

const ddmm = (data: string) => data.split("-").reverse().slice(0, 2).join("/")
/** Até quantos dias a fila mostra de uma vez (o resto, pelo filtro ou depois de conferir). */
const LIMITE = 80

/**
 * Fila "Dias para conferir" da remessa: os dias com alerta nas marcações que
 * ninguém ajustou nem conferiu, por funcionário, com o filtro por alerta.
 * Ajustar abre o dia no mês do funcionário; "Está certo" tira da fila.
 */
export function DiasParaConferir({
  remessaId,
  fila,
  filtro,
}: {
  remessaId: string
  fila: ConferenciaFuncionario[]
  /** Alerta escolhido no filtro (texto do alerta) ou undefined = todos. */
  filtro?: string
}) {
  const contagem = new Map<string, number>()
  for (const p of fila) for (const d of p.dias) for (const a of d.alertas) contagem.set(a, (contagem.get(a) ?? 0) + 1)
  const tipos = [...contagem].sort((a, b) => b[1] - a[1])
  const valido = filtro && contagem.has(filtro) ? filtro : undefined
  const filtrada = fila
    .map((p) => ({ ...p, dias: valido ? p.dias.filter((d) => d.alertas.includes(valido)) : p.dias }))
    .filter((p) => p.dias.length > 0)
  const total = filtrada.reduce((s, p) => s + p.dias.length, 0)
  const href = (a?: string) =>
    `/painel/pessoal/ponto/${remessaId}?aba=indicadores${a ? `&conferir=${encodeURIComponent(a)}` : ""}#dias-para-conferir`

  // Até LIMITE dias no total, na ordem dos funcionários.
  const visiveis: ConferenciaFuncionario[] = []
  let restam = LIMITE
  for (const p of filtrada) {
    if (restam <= 0) break
    visiveis.push({ ...p, dias: p.dias.slice(0, restam) })
    restam -= Math.min(restam, p.dias.length)
  }
  return (
    <Card id="dias-para-conferir" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base">Dias para conferir</CardTitle>
        <CardDescription>
          {fila.length === 0
            ? "Nenhum dia com alerta esperando conferência nas marcações desta remessa."
            : `${total} dia(s) com alerta nas marcações que ninguém olhou ainda. Muitos são erro de leitura do espelho (um horário lido errado vira marcação incompleta ou intervalo curto): Ajustar abre o dia para corrigir. Se o alerta é real, "Está certo" tira o dia da fila. O uso do sistema fora do horário sem marcação que cubra o uso é indício de hora extra ou intervalo não registrado.`}
        </CardDescription>
      </CardHeader>
      {fila.length > 0 && (
        <CardContent className="grid gap-4">
          <nav className="flex flex-wrap gap-2 text-xs" aria-label="Filtrar por alerta">
            <Link
              href={href()}
              className={`rounded-md border px-2 py-1 ${!valido ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
            >
              Todos ({fila.reduce((s, p) => s + p.dias.length, 0)})
            </Link>
            {tipos.map(([tipo, n]) => (
              <Link
                key={tipo}
                href={href(tipo)}
                className={`rounded-md border px-2 py-1 ${valido === tipo ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
              >
                {tipo} ({n})
              </Link>
            ))}
          </nav>

          <div className="grid gap-3">
            {visiveis.map((p) => {
              const total = filtrada.find((x) => x.registroId === p.registroId)?.dias.length ?? p.dias.length
              const mes = `/painel/pessoal/ponto/funcionario/${p.funcionarioId}/${p.registroId}?de=remessa`
              return (
                <section key={p.registroId} className="rounded-md border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                    <Link href={mes} className="text-sm font-medium hover:underline">
                      {p.nome}
                    </Link>
                    <span className="text-muted-foreground text-xs">{total} dia(s)</span>
                  </div>
                  <ul className="divide-y">
                    {p.dias.map((d) => (
                      <li key={d.data} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                        <span className="w-20 shrink-0 tabular-nums">
                          {ddmm(d.data)} {d.diaSemana}
                        </span>
                        <span className="min-w-40 tabular-nums">
                          {d.marcacoes.length ? d.marcacoes.join("  ") : d.semDia ? "não está no espelho" : (d.ocorrencia ?? "—")}
                        </span>
                        <span className="flex flex-1 flex-col gap-1">
                          <span className="flex flex-wrap gap-1">
                            {d.alertas.map((a) => (
                              <Badge key={a} variant="warning">
                                {a}
                              </Badge>
                            ))}
                          </span>
                          {d.detalheUso && <span className="text-muted-foreground text-xs">Uso no sistema: {d.detalheUso}</span>}
                        </span>
                        <span className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7" asChild>
                            <Link href={`${mes}&ajustar=${d.data}#dia-${d.data}`}>
                              <Pencil />
                              Ajustar
                            </Link>
                          </Button>
                          <ConferirDiaBotao registroId={p.registroId} data={d.data} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
          {total > LIMITE && (
            <p className="text-muted-foreground text-xs">
              Mostrando {LIMITE} de {total}. Filtre por alerta ou confira estes para ver os demais.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
