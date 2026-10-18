"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as Sentry from "@sentry/nextjs"
import { TriangleAlert } from "lucide-react"

import { useDentroDaCasca } from "@/components/portal/contador-avisos"
import { useRotaDesabilitada } from "@/components/portal/rotas-desabilitadas"
import { Button } from "@/components/ui/button"

/**
 * Erro dentro do portal do associado. O error.tsx fica abaixo do layout do
 * portal, então a casca (menu, cabeçalho, sino, barra inferior) continua na
 * tela (A67). O texto fala com o associado: o canal dele é o Atendimento, não
 * "a equipe do sistema". Fora da casca (tela de entrada, Oposição do
 * trabalhador não filiado) não há Atendimento nem Início para oferecer: nas
 * subpáginas da Oposição, o caminho de volta é a lista de campanhas. Com o
 * Atendimento desabilitado em Filiados › Área do associado, "Falar com o
 * sindicato" leva aos canais oficiais (O sindicato).
 */
export default function ErroPortal({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const dentro = useDentroDaCasca()
  const semAtendimento = useRotaDesabilitada("/portal/atendimento")
  const naOposicao = usePathname().startsWith("/portal/oposicao/")

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="bg-muted flex size-14 items-center justify-center rounded-full">
        <TriangleAlert className="text-muted-foreground size-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Não foi possível abrir esta página</h1>
        <p className="text-muted-foreground max-w-md text-sm text-balance">
          {dentro
            ? `Tente de novo em instantes. Se o problema continuar, fale com o sindicato ${semAtendimento ? "pelos canais oficiais" : "pelo Atendimento"} e informe o código abaixo.`
            : "Tente de novo em instantes. Se o problema continuar, procure o sindicato e informe o código abaixo."}
        </p>
        {error.digest && <p className="text-muted-foreground font-mono text-xs">Código: {error.digest}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>Tentar de novo</Button>
        {dentro ? (
          <>
            <Button asChild variant="outline">
              <Link href={semAtendimento ? "/portal/sindicato" : "/portal/atendimento"}>Falar com o sindicato</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/portal/inicio">Voltar ao início</Link>
            </Button>
          </>
        ) : (
          naOposicao && (
            <Button asChild variant="outline">
              <Link href="/portal/oposicao">Voltar à oposição</Link>
            </Button>
          )
        )}
      </div>
    </div>
  )
}
