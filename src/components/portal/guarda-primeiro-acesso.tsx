"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ArrowRight, ClipboardCheck } from "lucide-react"

import { hrefPrimeiroAcesso, livreDoPrimeiroAcesso } from "@/app/portal/primeiro-acesso/regras"
import { Button } from "@/components/ui/button"

/**
 * Primeiro acesso pendente (Filiados › Área do associado › Primeiro acesso):
 * no lugar do conteúdo, o convite para concluí-lo, levando a página de agora
 * como destino. As rotas que abrem de qualquer jeito (o próprio primeiro
 * acesso, Meu cadastro, Privacidade e dados, os direitos com prazo — entre
 * eles a Votação —, as preferências de avisos, a Ajuda, O sindicato, o
 * pedido de desfiliação pelo Atendimento e, só para cancelar, Hospedagem e
 * Eventos) passam direto — ver ROTAS_LIVRES_DO_PRIMEIRO_ACESSO.
 *
 * A escolha é no cliente, pelo caminho atual, como no PortalForaDoAr: o
 * layout não re-renderiza ao navegar. As ações que concluem um passo
 * revalidam o layout, e o portão some na hora. A ida é por <a> (carga
 * inteira, não navegação do roteador): se o primeiro acesso já tiver sido
 * concluído em outra aba, a casca volta atualizada em vez de mostrar o
 * portão de novo.
 *
 * "Ver como filiado" vê a página normal, com uma faixa no topo: quem atende
 * o associado ("onde está meu QR do Pix?") precisa do conteúdo, não do
 * convite. A faixa diz o que falta a ele e leva ao primeiro acesso como ele vê.
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

  if (hrefGestao) {
    return (
      <>
        <p
          role="note"
          className="border-warning/40 bg-warning/10 text-warning-fg flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs print:hidden"
        >
          <ClipboardCheck aria-hidden className="size-3.5 shrink-0" />
          <span>
            Visível só para a gestão: este associado ainda não concluiu o primeiro acesso (falta {resumo}) e vê o
            convite &quot;Antes de começar&quot; no lugar desta página.
          </span>
          <a href={href} className="underline underline-offset-2">
            Ver o primeiro acesso dele
          </a>
          <span aria-hidden>·</span>
          <Link href={hrefGestao} className="underline underline-offset-2">
            Configurar em Filiados › Área do associado
          </Link>
        </p>
        {children}
      </>
    )
  }

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
    </div>
  )
}
