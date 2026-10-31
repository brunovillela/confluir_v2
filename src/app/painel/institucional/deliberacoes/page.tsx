import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Gavel, ScrollText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { ROTULO_TIPO_REUNIAO, TIPOS_REUNIAO, type TipoReuniao } from "@/lib/atas-constantes"
import { hojeSP } from "@/lib/db/comum"
import { listarDeliberacoes, type FiltrosDeliberacoes } from "@/lib/db/deliberacoes"
import {
  CHAVES_DELIBERACOES,
  ehSigiloDeliberacao,
  ehSituacaoDeliberacao,
  nivelSigilo,
  ROTULO_NIVEL_SIGILO,
  SIGILOS_DELIBERACAO,
  SITUACOES_DELIBERACAO,
  sigilosVisiveis,
} from "@/lib/deliberacoes-constantes"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SeloSigilo, SeloSituacao } from "./selos"

export const metadata: Metadata = { title: "Deliberações — Confluir" }

const DATA = /^\d{4}-\d{2}-\d{2}$/
const SELECT = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm [color-scheme:light] dark:[color-scheme:dark]"
const POR_PAGINA = 100

/**
 * Consulta das deliberações registradas nas atas: o que se decidiu, quando,
 * em que reunião, e se foi cumprido. Filtros por período (data da ata),
 * assunto (busca no assunto e no teor), situação, sigilo e tipo de reunião.
 * Entra quem tem algum nível de sigilo; cada um vê só as deliberações até o
 * seu nível (livre ⊂ reservado ⊂ restrito).
 */
export default async function DeliberacoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    de?: string
    ate?: string
    assunto?: string
    situacao?: string
    sigilo?: string
    tipo?: string
    pagina?: string
  }>
}) {
  const [primeira, ...outras] = CHAVES_DELIBERACOES
  const sessao = await requirePermissao(primeira, outras)
  const nivel = nivelSigilo(sessao.permissoes)
  const sigilos = sigilosVisiveis(nivel)
  // O link para a ata só aparece para quem pode abrir atas.
  const verAtas = podeAcessar(sessao.permissoes, "diretoria_reunioes", ["diretoria_atas_consulta"])
  const sp = await searchParams

  const filtros: FiltrosDeliberacoes = {
    de: sp.de && DATA.test(sp.de) ? sp.de : undefined,
    ate: sp.ate && DATA.test(sp.ate) ? sp.ate : undefined,
    assunto: (sp.assunto ?? "").trim() || undefined,
    situacao: ehSituacaoDeliberacao(sp.situacao) ? sp.situacao : undefined,
    sigilo: ehSigiloDeliberacao(sp.sigilo) && sigilos.includes(sp.sigilo) ? sp.sigilo : undefined,
    tipo: TIPOS_REUNIAO.some((t) => t.chave === sp.tipo) ? (sp.tipo as TipoReuniao) : undefined,
  }
  const filtrado = Object.values(filtros).some(Boolean)

  const todas = await listarDeliberacoes(filtros, sigilos)
  const paginas = Math.max(1, Math.ceil(todas.length / POR_PAGINA))
  const pagina = Math.min(paginas, Math.max(1, Number(sp.pagina) || 1))
  const linhas = todas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const hoje = hojeSP()

  const contagem = SITUACOES_DELIBERACAO.map((s) => ({
    ...s,
    total: todas.filter((d) => d.situacao === s.chave).length,
  }))

  const url = (mudancas: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const base: Record<string, string | undefined> = {
      de: filtros.de,
      ate: filtros.ate,
      assunto: filtros.assunto,
      situacao: filtros.situacao,
      sigilo: filtros.sigilo,
      tipo: filtros.tipo,
      pagina: pagina > 1 ? String(pagina) : undefined,
      ...mudancas,
    }
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v)
    const s = p.toString()
    return `/painel/institucional/deliberacoes${s ? `?${s}` : ""}`
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
            <Link href="/painel/institucional">
              <ArrowLeft />
              Institucional
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Deliberações</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            As decisões registradas nas atas de reunião — o que se decidiu, quando e se já foi cumprido. Seu acesso:{" "}
            <strong>{ROTULO_NIVEL_SIGILO[nivel]}</strong>.
          </p>
        </div>
        {verAtas && (
          <Button variant="outline" asChild>
            <Link href="/painel/institucional/atas">
              <ScrollText />
              Atas de reunião
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {contagem.map((c) => (
          <Link
            key={c.chave}
            href={url({ situacao: filtros.situacao === c.chave ? undefined : c.chave, pagina: undefined })}
            className={`rounded-lg border p-3 transition-colors hover:bg-muted/50 ${filtros.situacao === c.chave ? "border-primary" : ""}`}
          >
            <p className="text-muted-foreground text-xs">{c.rotulo}</p>
            <p className="text-xl font-semibold tabular-nums">{c.total.toLocaleString("pt-BR")}</p>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Deliberações
            <span className="text-muted-foreground ml-2 text-sm font-normal">{todas.length.toLocaleString("pt-BR")}</span>
          </CardTitle>
          <CardDescription>O período é o da data da reunião.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" method="get">
            <div className="grid gap-1.5 lg:col-span-2">
              <Label htmlFor="assunto">Assunto</Label>
              <Input
                id="assunto"
                name="assunto"
                type="search"
                defaultValue={filtros.assunto ?? ""}
                placeholder="Busca no assunto e no teor"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="de">De</Label>
              <Input id="de" name="de" type="date" defaultValue={filtros.de ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" name="ate" type="date" defaultValue={filtros.ate ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="situacao">Situação</Label>
              <select id="situacao" name="situacao" defaultValue={filtros.situacao ?? ""} className={SELECT}>
                <option value="">Todas</option>
                {SITUACOES_DELIBERACAO.map((s) => (
                  <option key={s.chave} value={s.chave}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sigilo">Sigilo</Label>
              <select id="sigilo" name="sigilo" defaultValue={filtros.sigilo ?? ""} className={SELECT}>
                <option value="">Todos</option>
                {SIGILOS_DELIBERACAO.filter((s) => sigilos.includes(s.chave)).map((s) => (
                  <option key={s.chave} value={s.chave}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tipo">Reunião</Label>
              <select id="tipo" name="tipo" defaultValue={filtros.tipo ?? ""} className={SELECT}>
                <option value="">Todas</option>
                {TIPOS_REUNIAO.map((t) => (
                  <option key={t.chave} value={t.chave}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
              <Button type="submit" variant="secondary" size="sm">
                Filtrar
              </Button>
              {filtrado && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/painel/institucional/deliberacoes">Limpar</Link>
                </Button>
              )}
            </div>
          </form>

          {linhas.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <Gavel className="size-6" />
              <p className="text-sm">
                {filtrado ? "Nenhuma deliberação com esses filtros." : "Nenhuma deliberação registrada ainda — elas são lançadas na página de cada ata."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Deliberação</TableHead>
                    <TableHead>Reunião</TableHead>
                    <TableHead>Responsável e prazo</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Sigilo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((d) => {
                    const atrasada =
                      d.prazo && d.prazo < hoje && (d.situacao === "a_cumprir" || d.situacao === "em_execucao")
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="align-top whitespace-nowrap text-sm">
                          {d.ata.data ? formatarData(d.ata.data) : "—"}
                        </TableCell>
                        <TableCell className="max-w-96 align-top whitespace-normal">
                          {verAtas ? (
                            <Link
                              href={`/painel/institucional/atas/${d.ataId}#deliberacoes`}
                              className="font-medium hover:underline"
                            >
                              {d.assunto}
                            </Link>
                          ) : (
                            <span className="font-medium">{d.assunto}</span>
                          )}
                          {d.texto && d.texto !== d.assunto && (
                            <p className="text-muted-foreground line-clamp-3 text-xs whitespace-pre-wrap">{d.texto}</p>
                          )}
                          {d.votacao && <p className="text-muted-foreground text-xs">Votação: {d.votacao}</p>}
                        </TableCell>
                        <TableCell className="max-w-56 align-top whitespace-normal text-sm">
                          {verAtas ? (
                            <Link href={`/painel/institucional/atas/${d.ataId}`} className="hover:underline">
                              {d.ata.titulo ?? "(ata sem título)"}
                            </Link>
                          ) : (
                            (d.ata.titulo ?? "(ata sem título)")
                          )}
                          <span className="text-muted-foreground block text-xs">
                            {d.ata.tipo === "outra" && d.ata.orgao ? d.ata.orgao : ROTULO_TIPO_REUNIAO[d.ata.tipo]}
                          </span>
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          {d.responsavel ?? <span className="text-muted-foreground">—</span>}
                          {d.prazo && (
                            <span className={`block text-xs ${atrasada ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              até {formatarData(d.prazo)}
                              {atrasada && " · vencido"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <SeloSituacao situacao={d.situacao} />
                        </TableCell>
                        <TableCell className="align-top">
                          <SeloSigilo sigilo={d.sigilo} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {paginas > 1 && (
            <div className="text-muted-foreground flex items-center justify-between text-sm">
              <span>
                Página {pagina} de {paginas}
              </span>
              <div className="flex gap-2">
                {pagina > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={url({ pagina: String(pagina - 1) })}>Anterior</Link>
                  </Button>
                )}
                {pagina < paginas && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={url({ pagina: String(pagina + 1) })}>Próxima</Link>
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
