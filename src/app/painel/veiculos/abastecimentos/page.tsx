import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Fuel } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  listarAbastecimentos,
  listarCondutores,
  listarVeiculos,
} from "@/lib/db/veiculos"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"

import {
  ImportarAbastecimentosForm,
  NovoAbastecimentoForm,
} from "./abastecimento-forms"

export const metadata: Metadata = { title: "Abastecimentos — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = {
  busca?: string
  veiculo?: string
  pagina?: string
  salvo?: string
  importados?: string
}

export default async function AbastecimentosPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("veiculos_gestao")
  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const veiculoId = (brutos.veiculo ?? "").trim()
  const pagina = Number(brutos.pagina) > 0 ? Number(brutos.pagina) : 1

  const [lista, frota, condutoresRes] = await Promise.all([
    listarAbastecimentos({ busca, veiculoId: veiculoId || undefined, pagina }),
    listarVeiculos({ situacao: "todos" }),
    listarCondutores(),
  ])

  const opcoesVeiculo = frota
    .filter((v) => !v.inativo)
    .map((v) => ({
      id: v.id,
      rotulo: `${v.placa ?? "s/ placa"} — ${v.marca_modelo ?? ""}`,
    }))
  const opcoesCondutor = condutoresRes.condutores.map((c) => ({
    id: c.usuario_id,
    rotulo: c.usuarioNome ?? "(sem nome)",
  }))

  const filtrosQuery = (mudancas: Record<string, string>) => {
    const q = new URLSearchParams()
    const estado: Record<string, string> = {
      busca,
      veiculo: veiculoId,
      ...mudancas,
    }
    for (const [chave, valor] of Object.entries(estado)) {
      if (valor) q.set(chave, valor)
    }
    const s = q.toString()
    return s ? `?${s}` : ""
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos">
            <ArrowLeft />
            Veículos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Abastecimentos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Importação da fatura de combustível e lançamentos manuais
        </p>
      </div>

      {brutos.salvo && (
        <Alert variant="success">
          <AlertDescription>Abastecimento lançado.</AlertDescription>
        </Alert>
      )}
      {brutos.importados && (
        <Alert variant="success">
          <AlertDescription>
            Fatura importada: {brutos.importados} lançamento
            {Number(brutos.importados) === 1 ? "" : "s"}.
          </AlertDescription>
        </Alert>
      )}

      <GrupoColapsavel
        titulo="Importar fatura (CSV)"
        descricao="Caminho principal: o arquivo do posto ou cartão-combustível"
        aberto
      >
        <ImportarAbastecimentosForm />
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Lançamento manual"
        descricao="Um abastecimento por vez — exige veículo, condutor e hodômetro"
      >
        <NovoAbastecimentoForm
          veiculos={opcoesVeiculo}
          condutores={opcoesCondutor}
        />
      </GrupoColapsavel>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/veiculos/abastecimentos"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Posto ou cidade"
          className={`${SELECT_FILTRO} w-56`}
        />
        <select
          name="veiculo"
          defaultValue={veiculoId}
          className={SELECT_FILTRO}
        >
          <option value="">Todos os veículos</option>
          {opcoesVeiculo.map((v) => (
            <option key={v.id} value={v.id}>
              {v.rotulo}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {lista.linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Fuel className="mx-auto mb-2 size-5" />
              Nenhum abastecimento encontrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Posto</TableHead>
                  <TableHead>Combustível</TableHead>
                  <TableHead className="text-right">Litros</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Condutor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.linhas.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatarDataHora(a.data_hora)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {a.veiculoPlaca ?? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Legado s/ veículo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-52">
                      <span className="line-clamp-1">
                        {a.posto ?? "—"}
                        {a.cidade ? ` · ${a.cidade}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>{a.combustivel ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.volume?.toLocaleString("pt-BR") ?? "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(a.valor)}
                    </TableCell>
                    <TableCell>{a.usuarioNome ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {lista.totalPaginas > 1 && (
            <div className="text-muted-foreground mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="tabular-nums">
                Página {lista.pagina} de {lista.totalPaginas} ·{" "}
                {lista.total.toLocaleString("pt-BR")} lançamentos
              </span>
              <div className="flex gap-2">
                {lista.pagina > 1 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={filtrosQuery({ pagina: String(lista.pagina - 1) })}>
                      Anterior
                    </Link>
                  </Button>
                )}
                {lista.pagina < lista.totalPaginas && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={filtrosQuery({ pagina: String(lista.pagina + 1) })}>
                      Próxima
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
