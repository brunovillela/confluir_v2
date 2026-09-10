import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileWarning, Search, X } from "lucide-react"

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
import {
  cadastrosPendentes,
  ROTULO_PENDENCIA,
  TIPOS_PENDENCIA,
  type TipoPendencia,
} from "@/lib/db/filiacao-cadastros-pendentes"
import { formatarCnpjCpf, formatarDataHora } from "@/lib/formato"
import { semAcento } from "@/lib/texto"

export const metadata: Metadata = { title: "Cadastros pendentes — Confluir" }

const POR_PAGINA = 50

/** Filiados ativos com alguma inconsistência no cadastro ou no histórico. */
export default async function CadastrosPendentesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; pagina?: string; tipo?: string }>
}) {
  await requirePermissao("filiacao_filiados", ["filiacao_gestao"])
  const { busca = "", pagina: paginaTexto, tipo: tipoBruto } = await searchParams
  const pagina = Math.max(1, Number(paginaTexto) || 1)
  const tipo = (TIPOS_PENDENCIA as readonly string[]).includes(tipoBruto ?? "")
    ? (tipoBruto as TipoPendencia)
    : null

  const dados = await cadastrosPendentes()

  const termo = semAcento(busca.trim())
  const digitos = busca.replace(/\D/g, "")
  const filtrados = dados.linhas.filter((f) => {
    if (tipo && !f.tipos.includes(tipo)) return false
    if (!termo) return true
    if (digitos.length >= 3 && (f.cpf ?? "").includes(digitos)) return true
    return semAcento(f.nome ?? "").includes(termo)
  })
  const total = filtrados.length
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const daPagina = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const percentual =
    dados.ativos > 0 ? Math.round((dados.linhas.length / dados.ativos) * 100) : 0

  const urlTipo = (t: TipoPendencia | null) =>
    `/painel/filiados/cadastros-pendentes${t ? `?tipo=${t}` : ""}${busca ? `${t ? "&" : "?"}busca=${encodeURIComponent(busca)}` : ""}`

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Cadastros pendentes</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Filiados ativos com alguma inconsistência: dado fundamental faltando,
          termo legal não aceito, histórico sem vínculo em aberto ou vínculo
          incompleto.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        <Link href={urlTipo(null)} className="group">
          <Card className={!tipo ? "border-primary/50" : "group-hover:border-primary/40"}>
            <CardContent className="grid gap-1">
              <span className="text-muted-foreground text-xs">Com pendência</span>
              <span className="text-2xl font-semibold tabular-nums">
                {dados.linhas.length.toLocaleString("pt-BR")}
              </span>
              <span className="text-muted-foreground text-xs">
                {percentual}% de {dados.ativos.toLocaleString("pt-BR")} ativos
              </span>
            </CardContent>
          </Card>
        </Link>
        {TIPOS_PENDENCIA.map((t) => (
          <Link key={t} href={urlTipo(t)} className="group">
            <Card className={tipo === t ? "border-primary/50" : "group-hover:border-primary/40"}>
              <CardContent className="grid gap-1">
                <span className="text-muted-foreground text-xs">{ROTULO_PENDENCIA[t]}</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {dados.totais[t].toLocaleString("pt-BR")}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>
                {tipo ? ROTULO_PENDENCIA[tipo] : "Todas as pendências"}
              </CardTitle>
              <CardDescription>
                {total === 0
                  ? "Ninguém — nenhum cadastro ativo com esta pendência."
                  : `${total.toLocaleString("pt-BR")} cadastro(s)${busca ? " na busca" : ""}.`}
              </CardDescription>
            </div>
            <form className="flex gap-2">
              {tipo && <input type="hidden" name="tipo" value={tipo} />}
              <Input
                name="busca"
                defaultValue={busca}
                placeholder="Nome ou CPF"
                className="w-full sm:w-64"
              />
              <Button type="submit" variant="outline" size="icon">
                <Search />
              </Button>
              {(busca || tipo) && (
                <Button asChild variant="ghost" size="icon" title="Limpar">
                  <Link href="/painel/filiados/cadastros-pendentes">
                    <X />
                  </Link>
                </Button>
              )}
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {daPagina.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <FileWarning className="size-6" />
              <p className="text-sm">
                {busca ? "Ninguém encontrado com esse nome ou CPF." : "Nenhum cadastro pendente."}
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
                      <TableHead className="hidden lg:table-cell">Matrícula</TableHead>
                      <TableHead>Pendências</TableHead>
                      <TableHead className="w-36" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {daPagina.map((f) => (
                      <TableRow key={f.filiadoId}>
                        <TableCell className="max-w-64 truncate font-medium">
                          {f.nome ?? "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatarCnpjCpf(f.cpf) || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden lg:table-cell">
                          {f.matricula ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap gap-1">
                            {f.tipos.map((t) => (
                              <Badge
                                key={t}
                                variant={t === "vinculo" || t === "historico" ? "warning" : "outline"}
                                title={
                                  t === "vinculo"
                                    ? `Faltam: ${f.faltamNoVinculo.join(", ")}`
                                    : undefined
                                }
                              >
                                {t === "vinculo"
                                  ? `vínculo: ${f.faltamNoVinculo.join(", ")}`
                                  : ROTULO_PENDENCIA[t]}
                              </Badge>
                            ))}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={
                                f.vinculoId && f.tipos.length === 1 && f.tipos[0] === "vinculo"
                                  ? `/painel/filiados/${f.filiadoId}/vinculos/${f.vinculoId}`
                                  : `/painel/filiados/${f.filiadoId}`
                              }
                            >
                              {f.vinculoId && f.tipos.length === 1 && f.tipos[0] === "vinculo"
                                ? "Abrir vínculo"
                                : "Abrir cadastro"}
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
        A varredura passa por todos os cadastros ativos e por todos os vínculos,
        e fica guardada por 10 minutos. Última apuração:{" "}
        {formatarDataHora(dados.geradoEm)}.
      </p>
    </>
  )
}
