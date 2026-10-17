import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Award, TrendingUp } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VoltarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { carreiraDoFuncionario, formatarAliquota, rotuloNivelSalarial } from "@/lib/db/carreira"
import { usoCarreira } from "@/lib/db/carreira-area"
import { hojeSP } from "@/lib/db/comum"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Carreira do funcionário — Confluir" }

/**
 * Nível 2 de Anuênios e Níveis salariais: a CARREIRA do funcionário. Cada
 * parte só aparece se a entidade a usa (multitenant) e a pessoa tem a
 * permissão dela; cada lançamento leva ao nível 3 (a edição).
 */
export default async function CarreiraFuncionarioPage({ params }: { params: Promise<{ usuarioId: string }> }) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_anuenios", "pessoal_niveis_salariais"])
  const { usuarioId } = await params
  const [funcionario, carreira, uso] = await Promise.all([
    funcionarioDaArea(usuarioId),
    carreiraDoFuncionario(usuarioId),
    usoCarreira(),
  ])
  if (!funcionario) notFound()

  const veAnu = podeAcessar(sessao.permissoes, "pessoal_gestao", ["pessoal_anuenios"])
  const veNiv = podeAcessar(sessao.permissoes, "pessoal_gestao", ["pessoal_niveis_salariais"])
  const mostrarAnu = veAnu && (uso.anuenios || carreira.anuenios.length > 0)
  const mostrarNiv = veNiv && (uso.niveis || carreira.niveis.length > 0)
  const hoje = hojeSP()
  const atrasado = (d: string | null | undefined) => Boolean(d && d < hoje)
  const anu = carreira.anuenios[0]
  const niv = carreira.niveis[0]

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista
        chave="carreira-funcionarios"
        base="/painel/pessoal/"
        rotulo={mostrarAnu ? "Anuênios" : "Níveis salariais"}
        padrao={{
          href: mostrarAnu ? "/painel/pessoal/anuenios" : "/painel/pessoal/niveis",
          rotulo: mostrarAnu ? "Anuênios" : "Níveis salariais",
        }}
      />
      <CabecalhoFuncionario
        funcionario={funcionario}
        area="carreira"
        permissoes={sessao.permissoes}
        titulo={`Carreira — ${funcionario.nome}`}
      />

      {!mostrarAnu && !mostrarNiv && (
        <p className="text-muted-foreground text-sm">A entidade não usa anuênio nem níveis salariais.</p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {mostrarAnu && (
          <>
            <TileIndicador
              rotulo="Anuênio atual"
              valor={anu ? formatarAliquota(anu.nivelAtual?.aliquota) : "—"}
              nota={anu ? `nível ${anu.nivelAtual?.nivel ?? "?"} desde ${formatarData(anu.nivel_atual_data)}` : "sem lançamento"}
            />
            <TileIndicador
              rotulo="Próximo anuênio"
              valor={anu?.proximo_nivel_data ? formatarData(anu.proximo_nivel_data) : "—"}
              nota={anu?.proximoNivel ? `nível ${anu.proximoNivel.nivel ?? "?"} · ${formatarAliquota(anu.proximoNivel.aliquota)}${atrasado(anu.proximo_nivel_data) ? " · ATRASADO, sem lançamento" : ""}` : undefined}
            />
          </>
        )}
        {mostrarNiv && (
          <>
            <TileIndicador
              rotulo="Nível salarial"
              valor={niv?.nivelAtual ? rotuloNivelSalarial(niv.nivelAtual) : "—"}
              nota={
                niv?.nivelAtual?.salario_base != null
                  ? `salário básico ${formatarMoeda(niv.nivelAtual.salario_base)}`
                  : niv
                    ? undefined
                    : "sem lançamento"
              }
            />
            <TileIndicador
              rotulo="Próxima progressão"
              valor={niv?.proximo_nivel_data ? formatarData(niv.proximo_nivel_data) : "—"}
              nota={`${niv?.proximoNivel ? rotuloNivelSalarial(niv.proximoNivel) : (niv?.proximo_nivel_texto ?? "")}${atrasado(niv?.proximo_nivel_data) ? " · ATRASADO, sem lançamento" : ""}` || undefined}
            />
          </>
        )}
      </section>

      {mostrarAnu && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="size-4" /> Anuênios
            </CardTitle>
            <CardDescription>
              {carreira.anuenios.length} lançamento(s), do mais recente ao mais antigo.{" "}
              <Link href="/painel/pessoal/anuenios/novo" className="text-primary hover:underline">
                Novo lançamento
              </Link>
            </CardDescription>
          </CardHeader>
          {carreira.anuenios.length > 0 && (
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vale desde</TableHead>
                      <TableHead className="text-right">Nível</TableHead>
                      <TableHead className="text-right">Alíquota</TableHead>
                      <TableHead className="hidden md:table-cell">Próximo</TableHead>
                      <TableHead>Contabilidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {carreira.anuenios.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          <Link href={`/painel/pessoal/anuenios/${a.id}?de=carreira`} className="hover:underline">
                            {formatarData(a.nivel_atual_data)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{a.nivelAtual?.nivel ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatarAliquota(a.nivelAtual?.aliquota)}</TableCell>
                        <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                          {a.proximoNivel ? `Nível ${a.proximoNivel.nivel ?? "?"} em ${formatarData(a.proximo_nivel_data)}` : "—"}
                        </TableCell>
                        <TableCell>
                          {a.informado_contabilidade === true ? (
                            <Badge variant="success">Informado</Badge>
                          ) : (
                            <Badge variant="warning">Pendente</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {mostrarNiv && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4" /> Níveis salariais
            </CardTitle>
            <CardDescription>
              {carreira.niveis.length} lançamento(s), do mais recente ao mais antigo.{" "}
              <Link href="/painel/pessoal/niveis/novo" className="text-primary hover:underline">
                Novo lançamento
              </Link>
            </CardDescription>
          </CardHeader>
          {carreira.niveis.length > 0 && (
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vale desde</TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead className="text-right">Salário básico</TableHead>
                      <TableHead className="hidden sm:table-cell">Tipo de avanço</TableHead>
                      <TableHead className="hidden md:table-cell">Próximo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {carreira.niveis.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          <Link href={`/painel/pessoal/niveis/${n.id}?de=carreira`} className="hover:underline">
                            {formatarData(n.nivel_atual_data)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {rotuloNivelSalarial(n.nivelAtual)}
                          {n.cargoNome && <span className="text-muted-foreground block text-xs">{n.cargoNome}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n.nivelAtual?.salario_base != null ? formatarMoeda(n.nivelAtual.salario_base) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden sm:table-cell">{n.tipo_avanco ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                          {n.proximoNivel || n.proximo_nivel_texto
                            ? `${n.proximoNivel ? rotuloNivelSalarial(n.proximoNivel) : n.proximo_nivel_texto}${n.proximo_nivel_data ? ` em ${formatarData(n.proximo_nivel_data)}` : ""}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </>
  )
}
