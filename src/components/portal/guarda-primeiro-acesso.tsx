"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ArrowRight, ClipboardCheck, Settings2 } from "lucide-react"

import { hrefPrimeiroAcesso, livreDoPrimeiroAcesso } from "@/app/portal/primeiro-acesso/regras"
import { Button } from "@/components/ui/button"

/**
 * Primeiro acesso pendente (Filiados › Área do associado › Primeiro acesso):
 * no lugar do conteúdo, o convite para concluí-lo, levando a página de agora
 * como destino. As rotas que abrem de qualquer jeito (o próprio primeiro
 * acesso, Meu cadastro, Privacidade e dados, os direitos com prazo, as
 * preferências de avisos, a Ajuda e o pedido de desfiliação pelo
 * Atendimento) passam direto.
 *
 * A escolha é no cliente, pelo caminho atual, como no PortalForaDoAr: o
 * layout não re-renderiza ao navegar. As ações que concluem um passo
 * revalidam o layout, e o portão some na hora. A ida é por <a> (carga
 * inteira, não navegação do roteador): se o primeiro acesso já tiver sido
 * concluído em outra aba, a casca volta atualizada em vez de mostrar o
 * portão de novo.
 *
 * "Ver como filiado" vê o mesmo portão, com a nota da gestão.
 */
export function GuardaPrimeiroAcesso({
  resumo,
  hrefGestao,
  children,
}: {
  /** O que falta ("aceitar o termo de privacidade e completar seus dados"); null = nada. */
  resumo: string | null
  /** Só no "Ver como filiado": onde a gestão configura o primeiro acesso. */
  hrefGestao?: string | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const busca = useSearchParams()
  const q = busca.toString()
  const atual = q ? `${pathname}?${q}` : pathname
  // Com a busca: o pedido de desfiliação pelo Atendimento passa pela marca (?motivo=desfiliacao).
  if (!resumo || livreDoPrimeiroAcesso(atual)) return <>{children}</>

  const href = hrefPrimeiroAcesso(atual)

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 pt-2">
      <div className="grid justify-items-center gap-3 text-center">
        <div className="bg-primary/10 flex size-14 items-center justify-center rounded-full">
          <ClipboardCheck className="text-primary size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Antes de começar</h1>
        <p className="text-muted-foreground max-w-prose text-sm text-balance">
          Para usar o portal, falta {resumo}. É rápido, e depois você volta direto para esta página.
        </p>
        <Button asChild className="mt-1 h-11 px-5">
          {/* <a>, não <Link>: carga inteira de propósito (ver acima). */}
          <a href={href}>
            Continuar
            <ArrowRight data-icon="inline-end" />
          </a>
        </Button>
      </div>

      {hrefGestao && (
        <p className="text-muted-foreground flex flex-wrap items-center justify-center gap-1 text-center text-xs">
          <Settings2 aria-hidden className="size-3.5" />
          Visível só para a gestão: este associado vê esta tela até concluir o primeiro acesso. Configure em{" "}
          <Link href={hrefGestao} className="underline underline-offset-2">
            Filiados › Área do associado
          </Link>
          .
        </p>
      )}
    </div>
  )
}
