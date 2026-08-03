import type { Metadata } from "next"
import { Award, TrendingUp } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireSessaoPainel } from "@/lib/auth"
import {
  carreiraDoFuncionario,
  formatarAliquota,
  rotuloNivelSalarial,
} from "@/lib/db/carreira"
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Minha carreira — Confluir" }

/** Autosserviço: anuênios e nível salarial do próprio funcionário (leitura). */
export default async function MinhaCarreiraPage() {
  const sessao = await requireSessaoPainel()
  const carreira = await carreiraDoFuncionario(sessao.usuario.id)
  // Lançamentos vêm ordenados do mais recente para o mais antigo.
  const anuenioAtual = carreira.anuenios[0] ?? null
  const nivelAtual = carreira.niveis[0] ?? null

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha carreira</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Seus anuênios (tempo de casa) e a evolução do seu nível salarial no
          acordo coletivo.
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Meus anuênios</CardTitle>
              <Award className="text-muted-foreground size-4" />
            </div>
            <CardDescription>
              {anuenioAtual
                ? `Nível atual ${anuenioAtual.nivelAtual?.nivel ?? "—"} — ${formatarAliquota(anuenioAtual.nivelAtual?.aliquota)} sobre o salário básico`
                : "Alíquota por ano de casa sobre o salário básico"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {carreira.anuenios.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nenhum anuênio registrado para você ainda.
              </p>
            ) : (
              <>
                {anuenioAtual?.proximoNivel && (
                  <p className="text-muted-foreground mb-3 text-sm">
                    Próximo avanço: nível {anuenioAtual.proximoNivel.nivel}{" "}
                    ({formatarAliquota(anuenioAtual.proximoNivel.aliquota)}) em{" "}
                    {formatarData(anuenioAtual.proximo_nivel_data)}.
                  </p>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">Nível</TableHead>
                      <TableHead className="text-right">Alíquota</TableHead>
                      <TableHead>Vale desde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {carreira.anuenios.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-right font-medium tabular-nums">
                          {a.nivelAtual?.nivel ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarAliquota(a.nivelAtual?.aliquota)}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatarData(a.nivel_atual_data)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Meu nível salarial</CardTitle>
              <TrendingUp className="text-muted-foreground size-4" />
            </div>
            <CardDescription>
              {nivelAtual
                ? `Nível atual ${rotuloNivelSalarial(nivelAtual.nivelAtual)} — salário básico ${formatarMoeda(nivelAtual.nivelAtual?.salario_base)}`
                : "Degraus salariais do acordo coletivo de trabalho"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {carreira.niveis.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nenhum nível salarial registrado para você ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nível</TableHead>
                    <TableHead className="text-right">Salário básico</TableHead>
                    <TableHead className="hidden sm:table-cell">Avanço</TableHead>
                    <TableHead>Vale desde</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carreira.niveis.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {rotuloNivelSalarial(n.nivelAtual)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(n.nivelAtual?.salario_base)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {n.tipo_avanco ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatarData(n.nivel_atual_data)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
