import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ScrollText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import {
  listarAuditoria,
  rotuloTabela,
  TABELAS_AUDITADAS,
  usuariosDoPainel,
  type LinhaAuditoria,
} from "@/lib/db/auditoria"
import { formatarDataHora } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Auditoria — Confluir" }

const SELECT =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"

const ROTULO_OPERACAO: Record<LinhaAuditoria["operacao"], string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("institucional_auditoria", ["configuracoes", "permissoes"])
  const params = await searchParams
  const filtros = {
    tabela: params.tabela || undefined,
    registro: params.registro || undefined,
    usuarioId: params.usuario || undefined,
    de: params.de || undefined,
    ate: params.ate || undefined,
  }
  const paginacao = lerPaginacao(params, 30)
  const [{ linhas, total, disponivel }, usuarios] = await Promise.all([
    listarAuditoria(filtros, paginacao.pagina, paginacao.porPagina),
    usuariosDoPainel(),
  ])
  const totalPaginas = Math.max(1, Math.ceil(total / paginacao.porPagina))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <ScrollText className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Quem alterou o quê nas tabelas sensíveis: permissões, usuários, filiações, dados
          bancários, fornecedores, ordens e contratos.
        </p>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            A trilha ainda não está instalada no banco. Rode <code>supabase/auditoria.sql</code> no
            SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="grid gap-1.5">
              <Label htmlFor="tabela">Tabela</Label>
              <select id="tabela" name="tabela" defaultValue={filtros.tabela ?? ""} className={SELECT}>
                <option value="">Todas</option>
                {TABELAS_AUDITADAS.map((t) => (
                  <option key={t.tabela} value={t.tabela}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usuario">Quem alterou</Label>
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
              <Label htmlFor="registro">ID do registro</Label>
              <Input id="registro" name="registro" defaultValue={filtros.registro ?? ""} placeholder="uuid" />
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
                <Link href="/painel/institucional/auditoria">Limpar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              Nenhuma alteração registrada com esses filtros.
            </p>
          ) : (
            <ul className="divide-y">
              {linhas.map((l) => (
                <li key={l.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground tabular-nums">{formatarDataHora(l.momento)}</span>
                    <Badge variant={l.operacao === "DELETE" ? "destructive" : l.operacao === "INSERT" ? "default" : "secondary"}>
                      {ROTULO_OPERACAO[l.operacao]}
                    </Badge>
                    <span className="font-medium">{rotuloTabela(l.tabela)}</span>
                    <span className="text-muted-foreground">
                      por {l.usuarioNome ?? (l.papel === "service_role" ? "sistema (sem sessão)" : l.papel ?? "desconhecido")}
                    </span>
                    {l.registroId && (
                      <Link
                        href={`/painel/institucional/auditoria?tabela=${l.tabela}&registro=${l.registroId}`}
                        className="text-muted-foreground font-mono text-xs underline-offset-4 hover:underline"
                        title="Ver todo o histórico deste registro"
                      >
                        {l.registroId.slice(0, 8)}…
                      </Link>
                    )}
                  </div>
                  <Detalhe linha={l} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Paginacao
        total={total}
        pagina={paginacao.pagina}
        totalPaginas={totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />
    </>
  )
}

function valor(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "string") return v.length > 160 ? `${v.slice(0, 160)}…` : v
  if (typeof v === "object") {
    const s = JSON.stringify(v)
    return s.length > 160 ? `${s.slice(0, 160)}…` : s
  }
  return String(v)
}

/** O antes × depois dos campos alterados (ou o registro inteiro na criação/exclusão). */
function Detalhe({ linha }: { linha: LinhaAuditoria }) {
  const campos =
    linha.operacao === "UPDATE"
      ? linha.campos
      : Object.keys(linha.depois ?? linha.antes ?? {}).filter((k) => k !== "id" && k !== "emp_proprietaria_id")
  if (campos.length === 0) return null
  return (
    <details className="mt-1">
      <summary className="text-muted-foreground cursor-pointer text-xs">
        {linha.operacao === "UPDATE"
          ? `${campos.length} campo${campos.length === 1 ? "" : "s"}: ${campos.slice(0, 6).join(", ")}${campos.length > 6 ? "…" : ""}`
          : `${campos.length} campo${campos.length === 1 ? "" : "s"}`}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 text-left font-medium">Campo</th>
              <th className="py-1 pr-3 text-left font-medium">Antes</th>
              <th className="py-1 text-left font-medium">Depois</th>
            </tr>
          </thead>
          <tbody>
            {campos.map((c) => (
              <tr key={c} className="border-t">
                <td className="py-1 pr-3 font-mono">{c}</td>
                <td className="py-1 pr-3 break-all">{valor(linha.antes?.[c])}</td>
                <td className="py-1 break-all">{valor(linha.depois?.[c])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
