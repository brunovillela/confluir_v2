import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, ShieldCheck } from "lucide-react"

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
import { requirePermissao } from "@/lib/auth"
import { listarPerfis } from "@/lib/db/perfis"

export const metadata: Metadata = { title: "Perfis de acesso — Confluir" }

function alcadaLabel(v: number | null): string {
  if (v === null) return "Sem teto"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function PerfisPage() {
  await requirePermissao("permissoes", ["configuracoes"])
  const perfis = await listarPerfis()

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional/usuarios">
            <ArrowLeft />
            Usuários e permissões
          </Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/painel/institucional/usuarios/perfis/novo">
            <Plus />
            Novo perfil
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Perfis de acesso
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Pacotes de permissões atribuíveis às pessoas. Editar um perfil
          repercute em todos que o têm.
        </p>
      </div>

      <Card>
        <CardContent>
          {perfis.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <ShieldCheck className="mx-auto mb-2 size-5" />
              Nenhum perfil ainda. Rode supabase/perfis-acesso.sql para os perfis
              de fábrica, ou crie um novo.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Alçada</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perfis.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/painel/institucional/usuarios/perfis/${p.id}`}
                        className="text-primary hover:underline"
                      >
                        {p.nome}
                      </Link>
                      {p.sistema && (
                        <Badge variant="secondary" className="ml-2">
                          de fábrica
                        </Badge>
                      )}
                      {p.padrao_onboarding && (
                        <Badge
                          variant="outline"
                          className="border-accent/40 ml-2"
                        >
                          padrão no convite
                        </Badge>
                      )}
                      {p.descricao && (
                        <p className="text-muted-foreground text-xs">
                          {p.descricao}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {p.concede_tudo ? "Todas" : alcadaLabel(p.alcada_aprovacao)}
                    </TableCell>
                    <TableCell>
                      {p.ativo ? (
                        <Badge
                          variant="outline"
                          className="border-success/40 text-success-fg"
                        >
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
