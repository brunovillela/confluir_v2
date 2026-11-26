import { Users } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { UnificarCadastroForm } from "@/components/unificar-cadastro-form"
import { escolherPrincipal, outrosCadastrosDaPessoa } from "@/lib/db/usuarios-duplicados"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

function rotulo(c: { email: string | null; temLogin: boolean }): string {
  return `o cadastro ${c.email ?? "sem e-mail"}${c.temLogin ? " (com login)" : ""}`
}

/**
 * Aviso de que a pessoa tem outro cadastro em `usuarios` (mesmo CPF ou mesmo
 * nome), com o botão de unificar para quem administra os usuários. Some quando
 * não há nada. Usado na página do usuário (Gestão) e na ficha do diretor.
 */
export async function OutrosCadastros({
  usuarioId,
  voltar,
  podeUnificar,
}: {
  usuarioId: string
  voltar: string
  podeUnificar: boolean
}) {
  const outros = await outrosCadastrosDaPessoa(usuarioId).catch(() => [])
  if (outros.length === 0) return null

  const admin = await createAdminClient()
  const { data: atual } = await admin
    .from("usuarios")
    .select("email, auth_user_id")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  const este = {
    usuarioId,
    email: (atual?.email as string | null) ?? null,
    temLogin: Boolean(atual?.auth_user_id),
  }

  return (
    <Alert variant="warning">
      <AlertDescription className="grid gap-3">
        <span className="flex items-start gap-2">
          <Users className="mt-0.5 size-4 shrink-0" />
          <span>
            Esta pessoa tem {outros.length === 1 ? "outro cadastro" : `outros ${outros.length} cadastros`} no
            sistema. Com mais de um, o acesso, a diretoria e os pedidos podem cair em cadastros
            diferentes (e a pessoa não consegue pedir viagem ou diária, por exemplo). Unifique para
            ficar um só.
          </span>
        </span>
        <ul className="grid gap-2">
          {outros.map((o) => {
            const escolha = escolherPrincipal(este, o)
            const ficaEste = !("erro" in escolha) && escolha.principal === usuarioId
            return (
              <li
                key={o.usuarioId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
              >
                <span className="text-sm">
                  <strong>{o.nome ?? "(sem nome)"}</strong>
                  <span className="text-muted-foreground block text-xs">
                    {o.email ?? "sem e-mail"} · {o.cpf ? `CPF ${o.cpf}` : "sem CPF"} ·{" "}
                    {o.temLogin ? "com login" : "sem login"}
                    {o.temAcesso ? " · com acesso" : ""} · mesmo {o.motivo === "cpf" ? "CPF" : "nome"}
                  </span>
                </span>
                {"erro" in escolha ? (
                  <span className="text-muted-foreground max-w-xs text-xs">{escolha.erro}</span>
                ) : podeUnificar ? (
                  <UnificarCadastroForm
                    usuarioId={usuarioId}
                    outroId={o.usuarioId}
                    voltar={voltar}
                    fica={ficaEste ? rotulo(este) : rotulo(o)}
                    sai={ficaEste ? rotulo(o) : rotulo(este)}
                  />
                ) : (
                  <span className="text-muted-foreground max-w-xs text-xs">
                    Quem administra os usuários (Gestão › Usuários) pode unificar.
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
