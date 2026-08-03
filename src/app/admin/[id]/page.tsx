import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, UserRound } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { obterTenant } from "@/lib/db/plataforma"
import { formatarData } from "@/lib/formato"

import { EditarTenantForm } from "../tenant-forms"

export const metadata: Metadata = { title: "Organização — Confluir Plataforma" }

const VARIANTE_STATUS: Record<
  string,
  "success" | "warning" | "secondary" | "outline"
> = {
  ativo: "success",
  trial: "warning",
  suspenso: "secondary",
}

export default async function TenantDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const t = await obterTenant(id)
  if (!t) notFound()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/admin">
            <ArrowLeft />
            Organizações
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t.nomeRazao ?? "(sem nome)"}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              <span className="font-mono">{t.slug}.confluir.com.br</span>
              {t.criadoEm && <> · criada em {formatarData(t.criadoEm)}</>}
            </p>
          </div>
          <Badge variant={VARIANTE_STATUS[t.status] ?? "outline"}>
            {t.status}
          </Badge>
        </div>
      </div>

      {t.status === "suspenso" && (
        <Alert variant="warning">
          <AlertDescription>
            Organização <strong>suspensa</strong> — os acessos ficam bloqueados
            enquanto o status não voltar para ativo.
          </AlertDescription>
        </Alert>
      )}

      {/* Administradores */}
      <Card>
        <CardContent className="grid gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <UserRound className="text-muted-foreground size-4" />
            Administradores
          </p>
          {t.admins.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum administrador definido.
            </p>
          ) : (
            <ul className="grid gap-2">
              {t.admins.map((a) => (
                <li
                  key={a.usuarioId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {a.nome ?? "(sem nome)"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {a.email ?? "sem e-mail"}
                    </p>
                  </div>
                  <Badge variant={a.temLogin ? "success" : "warning"}>
                    {a.temLogin ? "Acesso ativo" : "Convite pendente"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Edição */}
      <Card>
        <CardContent>
          <p className="mb-4 text-sm font-medium">Dados da organização</p>
          <EditarTenantForm
            tenantId={t.id}
            inicial={{
              nomeRazao: t.nomeRazao,
              nomeFantasia: t.nomeFantasia,
              cnpjCpf: t.cnpjCpf,
              slug: t.slug,
              plano: t.plano,
              status: t.status,
            }}
          />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        <ExternalLink className="mr-1 inline size-3" />
        Quando o roteamento por subdomínio entrar no ar, esta organização será
        acessada em <span className="font-mono">{t.slug}.confluir.com.br</span>.
      </p>
    </>
  )
}
