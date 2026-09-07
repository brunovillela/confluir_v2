import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Search, Settings, ShieldOff } from "lucide-react"

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
import { Paginacao } from "@/components/paginacao"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { relatorioInadimplencia } from "@/lib/db/filiacao-inadimplencia"
import { formatarCnpjCpf, formatarDataHora } from "@/lib/formato"
import { semAcento } from "@/lib/texto"

export const metadata: Metadata = { title: "Inadimplentes — Confluir" }

const POR_PAGINA = 50

export default async function InadimplentesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; tipo?: string; pagina?: string }>
}) {
  await requirePermissao("filiacao_gestao")
  const { busca = "", tipo = "", pagina: paginaTexto } = await searchParams
  const pagina = Math.max(1, Number(paginaTexto) || 1)

  const dados = await relatorioInadimplencia()

  if (!dados.configurado) {
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
            Filiados inadimplentes
          </h1>
        </div>
        <Alert variant="info">
          <AlertDescription className="grid gap-3">
            <span>
              Nenhuma regra de inadimplência está ligada, então o sistema não
              considera ninguém inadimplente — e é assim que deve ser até a
              entidade decidir a própria regra.
            </span>
            <span>
              <Button asChild size="sm">
                <Link href="/painel/filiados/direitos">
                  <Settings />
                  Configurar as regras
                </Link>
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      </>
    )
  }

  const termo = semAcento(busca.trim())
  const digitos = busca.replace(/\D/g, "")
  const filtrados = dados.lista.filter((i) => {
    if (tipo && i.tipo !== tipo) return false
    if (!termo) return true
    if (digitos.length >= 3 && i.cpf.includes(digitos)) return true
    return semAcento(i.nome ?? "").includes(termo)
  })

  const total = filtrados.length
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const daPagina = filtrados.slice(
    (pagina - 1) * POR_PAGINA,
    pagina * POR_PAGINA
  )

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/painel/filiados">
              <ArrowLeft />
              Filiados
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Filiados inadimplentes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Quem está na condição definida pelas regras da entidade.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/painel/filiados/direitos">
            <Settings />
            Regras
          </Link>
        </Button>
      </div>

      <Alert variant="warning">
        <AlertDescription>
          Esta lista <strong>não muda a condição de ninguém</strong>. Ela
          aponta. Uma remessa que o empregador atrasou põe aqui gente em dia —
          por isso a decisão é de uma pessoa, caso a caso, e quem tem motivo
          legítimo recebe{" "}
          <Link href="/painel/filiados/direitos" className="underline">
            efeito suspensivo
          </Link>
          .
        </AlertDescription>
      </Alert>

      {dados.semCpf > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <strong>{dados.semCpf}</strong> filiados ativos não têm CPF no
            cadastro. A remessa diz quem pagou pelo CPF — sem ele, essas
            pessoas ficam de fora da apuração e nunca aparecem aqui, nem em dia
            nem em falta. Completar esses cadastros é o que as traz para a
            conta.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="grid gap-1">
            <span className="text-muted-foreground text-xs">
              Filiados ativos
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {dados.ativos}
            </span>
            <span className="text-muted-foreground text-xs">
              condição do cadastro
            </span>
          </CardContent>
        </Card>
        {dados.porTipo.map((t) => (
          <Card key={t.tipo}>
            <CardContent className="grid gap-1">
              <span className="text-muted-foreground text-xs">{t.tipo}</span>
              <span className="text-2xl font-semibold tabular-nums">
                {t.inadimplentes}
              </span>
              <span className="text-muted-foreground text-xs">
                {t.quantidade} falta(s)
                {t.exigirConsecutivas ? " seguidas" : ""} nas últimas{" "}
                {t.janelaRemessas}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {dados.suspensos > 0 && (
        <Alert variant="info">
          <ShieldOff />
          <AlertDescription>
            <strong>{dados.suspensos}</strong> das linhas abaixo têm efeito
            suspensivo em vigor — aparecem para conferência, mas não devem ser
            tratadas como inadimplentes.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Lista</CardTitle>
              <CardDescription>
                {total === 0
                  ? "Ninguém na condição de inadimplente."
                  : `${total} ocorrência(s)${tipo ? ` em ${tipo}` : ""}.`}
              </CardDescription>
            </div>
            <form className="flex flex-wrap gap-2">
              {tipo && <input type="hidden" name="tipo" value={tipo} />}
              <Input
                name="busca"
                defaultValue={busca}
                placeholder="Nome ou CPF"
                className="w-full sm:w-56"
              />
              <Button type="submit" variant="outline" size="icon">
                <Search />
              </Button>
            </form>
          </div>
          {dados.porTipo.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                asChild
                size="sm"
                variant={tipo ? "outline" : "default"}
              >
                <Link href="/painel/filiados/inadimplentes">Todos</Link>
              </Button>
              {dados.porTipo.map((t) => (
                <Button
                  key={t.tipo}
                  asChild
                  size="sm"
                  variant={tipo === t.tipo ? "default" : "outline"}
                >
                  <Link
                    href={`/painel/filiados/inadimplentes?tipo=${encodeURIComponent(t.tipo)}`}
                  >
                    {t.tipo}
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {daPagina.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Contribuição</TableHead>
                      <TableHead className="text-right">Faltas</TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Remessas em falta
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Último pagamento
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {daPagina.map((i) => (
                      <TableRow
                        key={`${i.cpf}-${i.tipo}`}
                        className={i.suspenso ? "opacity-60" : undefined}
                      >
                        <TableCell className="max-w-56 truncate font-medium">
                          {i.nome ?? "—"}
                          {i.suspenso && (
                            <Badge variant="secondary" className="ml-2">
                              suspenso
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatarCnpjCpf(i.cpf)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {i.tipo}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {i.faltas}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden max-w-72 truncate text-xs lg:table-cell">
                          {i.remessasEmFalta.join(", ")}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                          {i.ultimoPagamento ?? "nenhum na janela"}
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
        A apuração percorre as remessas da janela e fica guardada por 10
        minutos. Última: {formatarDataHora(dados.geradoEm)}.
      </p>
    </>
  )
}
