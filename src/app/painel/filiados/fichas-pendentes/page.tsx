import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileWarning, Search } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import { fichasPendentes } from "@/lib/db/filiacao-fichas-pendentes"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { semAcento } from "@/lib/texto"

export const metadata: Metadata = { title: "Fichas pendentes — Confluir" }

const POR_PAGINA = 50

function Numero({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: string | number
  detalhe?: string
}) {
  return (
    <Card>
      <CardContent className="grid gap-1">
        <span className="text-muted-foreground text-xs">{rotulo}</span>
        <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        {detalhe && (
          <span className="text-muted-foreground text-xs">{detalhe}</span>
        )}
      </CardContent>
    </Card>
  )
}

export default async function FichasPendentesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; pagina?: string }>
}) {
  await requirePermissao("filiacao_filiados", ["filiacao_gestao"])
  const { busca = "", pagina: paginaTexto } = await searchParams
  const pagina = Math.max(1, Number(paginaTexto) || 1)

  const dados = await fichasPendentes()

  const termo = semAcento(busca.trim())
  const digitos = busca.replace(/\D/g, "")
  const filtrados = termo
    ? dados.semFicha.filter((f) => {
        if (digitos.length >= 3 && (f.cpf ?? "").includes(digitos)) return true
        return semAcento(f.nome ?? "").includes(termo)
      })
    : dados.semFicha

  const total = filtrados.length
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const daPagina = filtrados.slice(
    (pagina - 1) * POR_PAGINA,
    pagina * POR_PAGINA
  )

  const percentual =
    dados.ativos > 0
      ? Math.round((dados.semFicha.length / dados.ativos) * 100)
      : 0

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Fichas de filiação pendentes
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Filiados ativos sem a ficha assinada anexada ao vínculo corrente.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Numero
          rotulo="Filiados ativos"
          valor={dados.ativos}
          detalhe="último vínculo em aberto"
        />
        <Numero
          rotulo="Sem ficha"
          valor={dados.semFicha.length}
          detalhe={`${percentual}% dos ativos`}
        />
        <Numero
          rotulo="Com ficha antiga"
          valor={dados.comFichaAntiga}
          detalhe="têm ficha em outro vínculo do histórico"
        />
      </div>

      <Alert variant="info">
        <AlertDescription className="grid gap-2">
          <span>
            <strong>Ativo</strong> aqui é quem tem o vínculo mais recente do
            histórico <strong>ainda em aberto</strong> — sem data de
            desfiliação. Quem se desfiliou de um emprego e se filiou por outro
            conta pelo vínculo novo.
          </span>
          <span>
            A ficha cobrada é a do <strong>vínculo corrente</strong>. É ela que
            autoriza o desconto atual; uma ficha de vínculo encerrado não
            sustenta a filiação de hoje.
          </span>
        </AlertDescription>
      </Alert>

      {dados.comFichaAntiga > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <strong>{dados.comFichaAntiga}</strong> dessas pessoas já têm ficha
            num vínculo <em>anterior</em> do histórico. Vale conferir se a ficha
            antiga cobre o vínculo atual ou se é caso de colher uma nova.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Quem está sem ficha</CardTitle>
              <CardDescription>
                {total === 0
                  ? "Ninguém — todo filiado ativo tem a ficha anexada."
                  : `${total} pessoa(s)${busca ? " na busca" : ""}.`}
              </CardDescription>
            </div>
            <form className="flex gap-2">
              <Input
                name="busca"
                defaultValue={busca}
                placeholder="Nome ou CPF"
                className="w-full sm:w-64"
              />
              <Button type="submit" variant="outline" size="icon">
                <Search />
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {daPagina.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <FileWarning className="size-6" />
              <p className="text-sm">
                {busca
                  ? "Ninguém encontrado com esse nome ou CPF."
                  : "Nenhuma ficha pendente."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Matrícula
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Fonte pagadora
                      </TableHead>
                      <TableHead>Filiação</TableHead>
                      <TableHead className="w-40" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {daPagina.map((f) => (
                      <TableRow key={f.vinculoId}>
                        <TableCell className="max-w-64 truncate font-medium">
                          {f.nome ?? "—"}
                          {f.temFichaEmOutroVinculo && (
                            <Badge variant="warning" className="ml-2">
                              ficha antiga
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatarCnpjCpf(f.cpf) || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden lg:table-cell">
                          {f.matricula ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden max-w-52 truncate md:table-cell">
                          {f.fonteNome ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatarData(f.dataFiliacao)}
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={`/painel/filiados/${f.filiadoId}/vinculos/${f.vinculoId}`}
                            >
                              Abrir vínculo
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4">
                <Paginacao
                  total={total}
                  pagina={pagina}
                  totalPaginas={totalPaginas}
                  porPagina={POR_PAGINA}
                  padrao={POR_PAGINA}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        A varredura passa pelos {dados.ativos > 0 ? "milhares de" : ""} vínculos
        do cadastro e fica guardada por 10 minutos — por isso a tela abre
        rápido. Última apuração: {formatarDataHora(dados.geradoEm)}.
      </p>
    </>
  )
}
