import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, ShieldCheck } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { formatarDataHora } from "@/lib/formato"
import { ROTA_VERIFICACAO, destinoSeguro } from "@/lib/mfa"
import { createClient } from "@/lib/supabase/server"

import { SegurancaForm } from "./seguranca-form"

export const metadata: Metadata = { title: "Segurança da conta — Confluir" }

/**
 * Cadastro e remoção do aplicativo autenticador (2FA). Fica fora do /painel
 * para servir também ao super-admin e, no futuro, ao portal e ao hotel.
 * `?obrigatorio=1`: o proxy mandou para cá porque a permissão exige o fator.
 */
export default async function SegurancaPage({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string; obrigatorio?: string; ok?: string }>
}) {
  const { voltar, obrigatorio, ok } = await searchParams
  const volta = destinoSeguro(voltar, "/painel/perfil")
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent("/conta/seguranca")}`)

  const [{ data: fatores }, { data: aal }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  const verificados = (fatores?.totp ?? [])
    .filter((f) => f.status === "verified")
    .map((f) => ({ id: f.id, nome: f.friendly_name ?? "Aplicativo autenticador", desde: formatarDataHora(f.created_at) }))
  const sessaoElevada = aal?.currentLevel === "aal2"

  return (
    <main className="bg-muted/40 flex min-h-svh flex-col items-center gap-6 p-4 py-10">
      <Marca variante="completa" />
      <div className="w-full max-w-lg space-y-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
            <Link href={volta}>
              <ArrowLeft />
              Voltar
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-muted-foreground size-5" />
            <h1 className="text-2xl font-semibold tracking-tight">Segurança da conta</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Verificação em duas etapas: além da senha, um código do aplicativo autenticador no
            seu celular (Google Authenticator, Microsoft Authenticator, Authy ou similar).
          </p>
        </div>

        {obrigatorio === "1" && verificados.length === 0 && (
          <Alert variant="warning">
            <AlertDescription>
              O seu perfil de acesso aprova pagamentos, administra usuários ou configurações.
              Por isso a verificação em duas etapas é obrigatória: cadastre o aplicativo abaixo
              para continuar usando o sistema.
            </AlertDescription>
          </Alert>
        )}
        {ok === "1" && (
          <Alert variant="success">
            <AlertDescription>
              Verificação em duas etapas ativada. A partir do próximo login, o sistema pedirá o
              código do aplicativo.
            </AlertDescription>
          </Alert>
        )}

        <SegurancaForm
          fatores={verificados}
          sessaoElevada={sessaoElevada}
          rotaVerificacao={`${ROTA_VERIFICACAO}?next=${encodeURIComponent("/conta/seguranca")}`}
          emailConta={user.email ?? ""}
        />

        <p className="text-muted-foreground text-xs">
          Perdeu o celular? A administração do sistema pode redefinir a verificação da sua conta
          na tela de usuários e permissões; você cadastra um aplicativo novo em seguida.
        </p>
      </div>
    </main>
  )
}
