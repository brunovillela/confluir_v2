import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { tituloDaSecao } from "@/components/portal/navegacao-portal"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { mensagemLinkRecusado } from "@/lib/auth-email-constantes"
import { destinoDoPortal } from "@/lib/portal-destino"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PortalLoginForm } from "./portal-login-form"

export const metadata: Metadata = {
  title: "Portal do Associado — Confluir",
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; next?: string | string[] }>
}) {
  // Link de acesso recusado em /auth/confirm (vencido, já usado…).
  const { erro, next: pedido } = await searchParams
  const mensagemErro = mensagemLinkRecusado(erro, "portal")
  // Para onde voltar depois de entrar (A30): o item do aviso por e-mail, não
  // o Início. Só caminhos do portal — o resto é ignorado.
  const next = destinoDoPortal(Array.isArray(pedido) ? pedido[0] : pedido)

  // Quem já está dentro (filiado logado ou gestão em "Ver como filiado") vai
  // direto ao destino: a tela de entrada não pode aparecer dentro da casca.
  if (await getVisualizacaoPortal()) redirect(next ?? "/portal/inicio")

  const secao = next ? tituloDaSecao(next.split("?")[0]) : null

  return (
    <AuthShell
      rodape={
        <>
          É funcionário do sindicato?{" "}
          <Link
            href="/login"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Entre pelo painel
          </Link>
        </>
      }
    >
      <div className="grid gap-4">
        {mensagemErro && (
          <Alert variant="destructive">
            <AlertDescription>{mensagemErro}</AlertDescription>
          </Alert>
        )}
        {/* Quem veio de um link explica-se: entrar leva de volta ao que abriu. */}
        {next && !mensagemErro && (
          <Alert variant="info">
            <AlertDescription>
              {secao
                ? `Depois de entrar, você segue direto para ${secao}.`
                : "Depois de entrar, você segue direto para a página que abriu."}
            </AlertDescription>
          </Alert>
        )}
        <PortalLoginForm next={next} />
      </div>
    </AuthShell>
  )
}
