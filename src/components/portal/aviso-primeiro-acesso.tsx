import { ArrowRight, ClipboardCheck } from "lucide-react"

import { hrefPrimeiroAcesso } from "@/app/portal/primeiro-acesso/regras"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/**
 * Página que abre antes do primeiro acesso só para cancelar (Hospedagem e
 * Eventos — ver ROTAS_LIVRES_DO_PRIMEIRO_ACESSO): no topo, o que dá para
 * fazer aqui, o que falta para o resto e o caminho para concluir, voltando a
 * esta página. Os botões que gravariam somem da página e apontam para cá
 * ("veja o aviso no topo da página").
 */
export function AvisoPrimeiroAcesso({
  resumo,
  destino,
  aqui,
  para,
}: {
  /** O que falta ("aceitar o termo de privacidade e completar seus dados"); vazio = genérico. */
  resumo: string
  /** A página atual: para onde o primeiro acesso volta ao ser concluído. */
  destino: string
  /** O que continua possível aqui ("Aqui você consulta e cancela as suas inscrições."). */
  aqui: string
  /** O que espera o primeiro acesso ("se inscrever em eventos"). */
  para: string
}) {
  return (
    <Alert variant="info">
      <ClipboardCheck aria-hidden />
      <AlertTitle>Falta concluir o primeiro acesso</AlertTitle>
      <AlertDescription className="grid gap-3">
        <p>
          {aqui} Para {para}, {resumo ? `falta ${resumo}` : "conclua antes o primeiro acesso"}.
        </p>
        <div>
          <Button asChild size="sm">
            {/* <a>, não <Link>: carga inteira, como no portão (GuardaPrimeiroAcesso). */}
            <a href={hrefPrimeiroAcesso(destino)}>
              Concluir o primeiro acesso
              <ArrowRight data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
