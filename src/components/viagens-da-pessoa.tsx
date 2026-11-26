import Link from "next/link"
import { Plane } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ResumoItensViagem } from "@/components/viagens"
import { minhasViagens, nomeDoEvento, type Viagem } from "@/lib/db/viagens"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { resumirViagensPorAno, valorDaViagem } from "@/lib/viagens-relatorio"

/**
 * Relatório das passagens e hospedagens que a entidade adquiriu para uma
 * pessoa (viagens atendidas): um quadro por ano e a lista das viagens. Usado
 * na página do funcionário, na ficha do diretor (com valores, para a gestão)
 * e em Minhas viagens (sem valores: quem viaja não vê o custo).
 */
export async function ViagensDaPessoa({
  usuarioId,
  nome,
  mostrarValores,
  baseDetalhe,
  verTodas,
  mostrarLista = true,
}: {
  usuarioId: string
  nome: string | null
  mostrarValores: boolean
  /** Prefixo do link de cada viagem (`${baseDetalhe}/${id}`); sem ele, sem link. */
  baseDetalhe?: string
  /** Link para a lista completa (ex.: Solicitações filtradas pela pessoa). */
  verTodas?: string
  /** Em Minhas viagens a lista já existe abaixo: só o quadro por ano. */
  mostrarLista?: boolean
}) {
  const { disponivel, viagens } = await minhasViagens(usuarioId).catch(() => ({
    disponivel: false,
    viagens: [] as Viagem[],
  }))
  if (!disponivel) return null

  const atendidas = viagens.filter((v) => v.situacao === "atendida")
  const abertas = viagens.filter(
    (v) => v.situacao === "solicitada" || v.situacao === "em_atendimento"
  ).length
  const anos = resumirViagensPorAno(atendidas)
  // Sem nome é a própria pessoa (Minhas viagens).
  const primeiro = nome ? nome.split(" ")[0] : "você"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plane className="size-4" />
          Viagens e hospedagens
        </CardTitle>
        <CardDescription>
          {atendidas.length === 0
            ? `Nenhuma passagem ou hospedagem adquirida para ${primeiro}.`
            : `Passagens e hospedagens que a entidade adquiriu para ${primeiro}, por ano da viagem.`}
          {abertas > 0 && ` ${abertas === 1 ? "1 pedido" : `${abertas} pedidos`} em andamento.`}
        </CardDescription>
      </CardHeader>
      {(anos.length > 0 || verTodas) && (
        <CardContent className="grid gap-4">
          {anos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr className="border-b">
                    <th className="py-1.5 pr-3 font-medium">Ano</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Viagens</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Passagens</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Noites de hotel</th>
                    {mostrarValores && <th className="py-1.5 text-right font-medium">Valor</th>}
                  </tr>
                </thead>
                <tbody>
                  {anos.map((a) => (
                    <tr key={a.ano} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 font-medium">{a.ano}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{a.viagens}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {a.passagens}
                        {a.aereas > 0 && a.rodoviarias > 0 && (
                          <span className="text-muted-foreground text-xs">
                            {" "}
                            ({a.aereas} aérea{a.aereas === 1 ? "" : "s"}, {a.rodoviarias} rodoviária
                            {a.rodoviarias === 1 ? "" : "s"})
                          </span>
                        )}
                        {a.passagens > 0 && (a.aereas === 0 || a.rodoviarias === 0) && (
                          <span className="text-muted-foreground text-xs">
                            {" "}
                            ({a.aereas > 0 ? (a.aereas === 1 ? "aérea" : "aéreas") : a.rodoviarias === 1 ? "rodoviária" : "rodoviárias"})
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{a.noites}</td>
                      {mostrarValores && (
                        <td className="py-1.5 text-right tabular-nums">{formatarMoeda(a.valor)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {mostrarLista && atendidas.length > 0 && (
            <ul className="grid gap-2 text-sm">
              {atendidas.slice(0, 10).map((v) => {
                const evento = nomeDoEvento(v)
                const titulo = (
                  <>
                    <span className="font-medium">Nº {v.numero ?? "—"}</span>
                    {v.inicio && <span className="text-muted-foreground"> · {formatarData(v.inicio)}</span>}
                    <span className="text-muted-foreground"> · {evento ?? v.motivo}</span>
                  </>
                )
                return (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-md border p-2"
                  >
                    <div className="grid min-w-0 gap-1">
                      {baseDetalhe ? (
                        <Link href={`${baseDetalhe}/${v.id}`} className="hover:underline">
                          {titulo}
                        </Link>
                      ) : (
                        <span>{titulo}</span>
                      )}
                      <ResumoItensViagem itens={v.itens} />
                    </div>
                    {mostrarValores && (
                      <span className="tabular-nums">{formatarMoeda(valorDaViagem(v))}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {verTodas && viagens.length > 0 && (
            <div>
              <Button variant="outline" size="sm" asChild>
                <Link href={verTodas}>Ver todos os pedidos</Link>
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
