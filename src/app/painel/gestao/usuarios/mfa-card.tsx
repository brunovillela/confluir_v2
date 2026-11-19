import { ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { segundoFatorAtivo } from "@/lib/db/acessos-mfa"

import { RedefinirSegundoFator } from "./mfa-form"

/** Ficha do usuário: situação do 2FA e a redefinição pela gestão. */
export async function CartaoSegundoFator({
  usuarioId,
  acessoId,
  redefinida = false,
}: {
  usuarioId: string
  acessoId: string
  redefinida?: boolean
}) {
  const ativo = await segundoFatorAtivo(usuarioId)
  return (
    <Card>
      <CardContent className="grid gap-3 pt-6">
        {redefinida && (
          <Alert variant="success">
            <AlertDescription>
              Verificação redefinida. A pessoa entra só com a senha e cadastra um aplicativo novo
              em Segurança da conta.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="text-muted-foreground size-4" />
              Verificação em duas etapas
            </p>
            <p className="text-muted-foreground text-xs">
              Código do aplicativo autenticador além da senha. A pessoa cadastra em Meu perfil →
              Segurança da conta; a gestão só redefine quando ela perde o celular.
            </p>
          </div>
          {ativo === null ? (
            <Badge variant="outline">Sem conta de acesso</Badge>
          ) : ativo ? (
            <Badge className="bg-success text-success-foreground">Ativa</Badge>
          ) : (
            <Badge variant="secondary">Não cadastrada</Badge>
          )}
        </div>
        {ativo && <RedefinirSegundoFator usuarioId={usuarioId} acessoId={acessoId} />}
      </CardContent>
    </Card>
  )
}
