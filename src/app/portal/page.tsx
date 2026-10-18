import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { CanaisDaEntidade } from "@/components/portal/canais-da-entidade"
import { tituloDaSecao } from "@/components/portal/navegacao-portal"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { mensagemLinkRecusado } from "@/lib/auth-email-constantes"
import { opcoesDaParte, situacaoDoPortal } from "@/lib/db/portal-partes"
import { destinoAoEntrar } from "@/lib/db/portal-primeiro-acesso"
import { canaisDoSindicato } from "@/lib/db/sindicato-portal"
import { destinoDoPortal } from "@/lib/portal-destino"
import { mensagemDaSituacao, opcoesPadrao } from "@/lib/portal-partes-constantes"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PortalLoginForm } from "./portal-login-form"
import { avisoDaSessaoSemPortal } from "./situacao-entrada"

// Mesmo sufixo das páginas de dentro (A183). O modelo do layout não alcança
// esta página (é o mesmo segmento), então o título vai inteiro.
export const metadata: Metadata = {
  title: "Entrar — Portal do Associado",
}

/** Rodapé da tela: o funcionário entra por outra porta. */
const RODAPE = (
  <>
    É funcionário do sindicato?{" "}
    <Link
      href="/login"
      className="text-foreground font-medium underline-offset-4 hover:underline"
    >
      Entre pelo painel
    </Link>
  </>
)

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

  // Filiados › Área do associado › Portal inteiro. Na dúvida (leitura que
  // falhou), a entrada de sempre, com os textos padrão.
  const [portal, opcoes] = await Promise.all([
    situacaoDoPortal().catch(() => null),
    opcoesDaParte("portal").catch(() => opcoesPadrao("portal")),
  ])

  // Portal fora do ar: a mensagem e os canais da entidade no lugar da entrada
  // (as actions de entrada também recusam). Quem já tem sessão NÃO é mandado
  // ao Início: lá a casca mostra a manutenção, e uma guarda que devolvesse
  // para cá fecharia um laço de redirecionamento.
  if (portal?.estado === "desabilitada") {
    const canais = await canaisDoSindicato().catch(() => null)
    return (
      <AuthShell rodape={RODAPE}>
        <Card>
          <CardHeader>
            <CardTitle>Portal do Associado</CardTitle>
            <CardDescription>Temporariamente indisponível.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Alert variant="warning">
              <AlertDescription>{mensagemDaSituacao("portal", portal)}</AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <p className="text-sm font-medium">Fale com o sindicato</p>
              <CanaisDaEntidade canais={canais} />
            </div>
            {/* A oposição tem prazo legal e entrada própria: não sai do ar. */}
            <p className="text-muted-foreground text-xs">
              A oposição à contribuição assistencial continua aberta:{" "}
              <Link
                href="/portal/oposicao"
                className="text-foreground font-medium underline-offset-4 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
              >
                registrar oposição
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  // Quem já está dentro (filiado logado ou gestão em "Ver como filiado") vai
  // direto ao destino: a tela de entrada não pode aparecer dentro da casca.
  // O filiado com o primeiro acesso pendente passa por ele antes, levando o
  // destino junto (no "Ver como filiado", a casca mostra o portão).
  const vis = await getVisualizacaoPortal()
  if (vis) {
    const destino = next ?? "/portal/inicio"
    redirect(vis.preview ? destino : await destinoAoEntrar(vis.filiado, destino))
  }

  // Entrou pelo botão do e-mail, mas a filiação não está ativa (ex.: filiação
  // coletiva em andamento, A4): explica, em vez de mostrar a entrada muda.
  // Só aparece para a sessão do próprio dono do CPF.
  const avisoSessao = await avisoDaSessaoSemPortal()

  const secao = next ? tituloDaSecao(next.split("?")[0]) : null
  // Orientação fixa, para todo mundo (anti-enumeração): em branco, volta a padrão.
  const orientacao = opcoes.orientacao_entrada.trim() || opcoesPadrao("portal").orientacao_entrada

  return (
    <AuthShell rodape={RODAPE}>
      <div className="grid gap-4">
        {mensagemErro && (
          <Alert variant="destructive">
            <AlertDescription>{mensagemErro}</AlertDescription>
          </Alert>
        )}
        {avisoSessao && !mensagemErro && (
          <Alert variant="warning">
            <AlertDescription>{avisoSessao}</AlertDescription>
          </Alert>
        )}
        {/* Aviso da entidade a quem vai entrar (Área do associado › Portal inteiro). */}
        {opcoes.aviso_entrada && (
          <Alert variant="info">
            <AlertDescription className="whitespace-pre-line">{opcoes.aviso_entrada}</AlertDescription>
          </Alert>
        )}
        {/* Quem veio de um link explica-se: entrar leva de volta ao que abriu. */}
        {next && !mensagemErro && !avisoSessao && (
          <Alert variant="info">
            <AlertDescription>
              {secao
                ? `Depois de entrar, você segue direto para ${secao}.`
                : "Depois de entrar, você segue direto para a página que abriu."}
            </AlertDescription>
          </Alert>
        )}
        <PortalLoginForm
          next={next}
          preferirCodigo={typeof erro === "string" && erro.startsWith("link_")}
          orientacao={orientacao}
        />
      </div>
    </AuthShell>
  )
}
