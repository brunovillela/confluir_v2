import type { Metadata } from "next"
import Link from "next/link"
import { Building2, Plus } from "lucide-react"

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
import { listarTenants } from "@/lib/db/plataforma"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Tenants — Confluir Plataforma" }

const VARIANTE_STATUS: Record<
  string,
  "success" | "warning" | "secondary" | "outline"
> = {
  ativo: "success",
  trial: "warning",
  suspenso: "secondary",
}

export default async function AdminTenantsPage() {
  const tenants = await listarTenants()

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizações</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {tenants.length} {tenants.length === 1 ? "tenant" : "tenants"} na
            plataforma
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/novo">
            <Plus />
            Nova organização
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent>
          {tenants.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              <Building2 className="mx-auto mb-2 size-5" />
              Nenhuma organização cadastrada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organização</TableHead>
                    <TableHead>Subdomínio</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Criada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link
                          href={`/admin/${t.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {t.nome ?? "(sem nome)"}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {t.slug}
                      </TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE_STATUS[t.status] ?? "outline"}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{t.plano ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatarData(t.criadoEm)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
