import Link from "next/link"

import { Paginacao } from "@/components/paginacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { listarChavesApi, listarRequisicoesApi } from "@/lib/api-publica"
import { usuariosDoPainel } from "@/lib/db/auditoria"
import { nomesDosUsuarios } from "@/lib/db/comum"
import {
  listarExportacoes,
  RECURSOS_EXPORTACAO,
  ROTULO_CATEGORIA,
  rotuloRecurso,
  type CategoriaExportada,
} from "@/lib/exportacoes"
import { formatarDataHora } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"

/**
 * Saídas de dados (achados M5 e M6 da RIPD da base multi-entidade): o livro
 * de exportações e o log da API, nas abas da Auditoria.
 */

type Params = Record<string, string | undefined>

const SELECT =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"

const data = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

/** Filtros guardados como {chave: valor} → "chave: valor · …" (resumido). */
function resumoFiltros(f: Record<string, unknown>): string {
  const partes = Object.entries(f)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
  const s = partes.join(" · ")
  return s.length > 180 ? `${s.slice(0, 180)}…` : s
}

export async function AuditoriaExportacoes({ params }: { params: Params }) {
  const filtros = {
    recurso: params.recurso && params.recurso in RECURSOS_EXPORTACAO ? params.recurso : undefined,
    usuarioId: params.usuario || undefined,
    de: data(params.de),
    ate: data(params.ate),
  }
  const paginacao = lerPaginacao(params, 30)
  const [{ linhas, total, disponivel }, usuarios] = await Promise.all([
    listarExportacoes(filtros, paginacao.pagina, paginacao.porPagina),
    usuariosDoPainel(),
  ])
  const nomes = await nomesDosUsuarios(linhas.map((l) => l.usuarioId).filter((v): v is string => !!v))
  const totalPaginas = Math.max(1, Math.ceil(total / paginacao.porPagina))

  return (
    <>
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>O livro de exportações ainda não está no banco (falta aplicar a migração).</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="aba" value="exportacoes" />
            <div className="grid gap-1.5">
              <Label htmlFor="recurso">O que foi exportado</Label>
              <select id="recurso" name="recurso" defaultValue={filtros.recurso ?? ""} className={SELECT}>
                <option value="">Tudo</option>
                {Object.entries(RECURSOS_EXPORTACAO).map(([chave, r]) => (
                  <option key={chave} value={chave}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usuario">Quem exportou</Label>
              <select id="usuario" name="usuario" defaultValue={filtros.usuarioId ?? ""} className={SELECT}>
                <option value="">Qualquer pessoa</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="de">De</Label>
              <Input id="de" name="de" type="date" defaultValue={filtros.de ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" name="ate" type="date" defaultValue={filtros.ate ?? ""} />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">Filtrar</Button>
              <Button type="button" variant="ghost" asChild>
                <Link href="/painel/institucional/auditoria?aba=exportacoes">Limpar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">Nenhuma exportação registrada com esses filtros.</p>
          ) : (
            <ul className="divide-y">
              {linhas.map((l) => (
                <li key={l.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground tabular-nums">{formatarDataHora(l.momento)}</span>
                    <span className="font-medium">{rotuloRecurso(l.recurso)}</span>
                    {l.formato && <Badge variant="secondary">{l.formato.toUpperCase()}</Badge>}
                    <span className="tabular-nums">
                      {l.quantidade === null ? "" : `${l.quantidade.toLocaleString("pt-BR")} linha${l.quantidade === 1 ? "" : "s"}`}
                    </span>
                    <span className="text-muted-foreground">por {l.usuarioId ? (nomes.get(l.usuarioId) ?? "usuário removido") : "desconhecido"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {l.categorias.map((c) => (
                      <Badge key={c} variant={c === "cpf" || c === "saude" || c === "voto" ? "warning" : "outline"}>
                        {ROTULO_CATEGORIA[c as CategoriaExportada] ?? c}
                      </Badge>
                    ))}
                    <span className="text-muted-foreground font-mono">{l.rota}</span>
                  </div>
                  {Object.keys(l.filtros).length > 0 && <p className="text-muted-foreground text-xs break-all">Recorte: {resumoFiltros(l.filtros)}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Paginacao total={total} pagina={paginacao.pagina} totalPaginas={totalPaginas} porPagina={paginacao.porPagina} padrao={30} />
    </>
  )
}

export async function AuditoriaApi({ params }: { params: Params }) {
  const { chaves } = await listarChavesApi()
  const filtros = {
    chaveId: params.chave && chaves.some((c) => c.id === params.chave) ? params.chave : undefined,
    recusadas: params.recusadas === "1",
    de: data(params.de),
    ate: data(params.ate),
  }
  const paginacao = lerPaginacao(params, 30)
  const { linhas, total, disponivel } = await listarRequisicoesApi(filtros, paginacao.pagina, paginacao.porPagina)
  const nomeChave = new Map(chaves.map((c) => [c.id, `${c.nome} (cf_${c.prefixo}_…)`]))
  const totalPaginas = Math.max(1, Math.ceil(total / paginacao.porPagina))

  return (
    <>
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>O log da API ainda não está no banco (falta aplicar a migração).</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="aba" value="api" />
            <div className="grid gap-1.5">
              <Label htmlFor="chave">Chave</Label>
              <select id="chave" name="chave" defaultValue={filtros.chaveId ?? ""} className={SELECT}>
                <option value="">Todas</option>
                {chaves.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.revogadaEm ? " (revogada)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <label htmlFor="recusadas" className="flex items-end gap-2 pb-2 text-sm">
              <input id="recusadas" type="checkbox" name="recusadas" value="1" defaultChecked={filtros.recusadas} />
              Só as recusadas
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="de">De</Label>
              <Input id="de" name="de" type="date" defaultValue={filtros.de ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" name="ate" type="date" defaultValue={filtros.ate ?? ""} />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">Filtrar</Button>
              <Button type="button" variant="ghost" asChild>
                <Link href="/painel/institucional/auditoria?aba=api">Limpar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">Nenhuma requisição registrada com esses filtros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Chave</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">{formatarDataHora(l.momento)}</TableCell>
                    <TableCell className="text-xs">{l.chaveId ? (nomeChave.get(l.chaveId) ?? l.chaveId.slice(0, 8)) : <span className="text-muted-foreground">chave inválida</span>}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.rota}
                      {Object.keys(l.parametros).length > 0 && <span className="text-muted-foreground block break-all">{resumoFiltros(l.parametros)}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.status < 300 ? "success" : l.status === 429 || l.status >= 500 ? "warning" : "destructive"}>{l.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.quantidade === null ? "—" : l.quantidade.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{l.origemIp ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Paginacao total={total} pagina={paginacao.pagina} totalPaginas={totalPaginas} porPagina={paginacao.porPagina} padrao={30} />
    </>
  )
}
