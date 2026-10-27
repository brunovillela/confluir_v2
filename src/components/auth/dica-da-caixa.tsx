"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"

/**
 * Caixas da Microsoft: o código chega como "entregue" e não é aberto — vai
 * para o Lixo eletrônico (Halliburton, 21/10/2026: 13 dos 22 e-mails que
 * pediram 3+ códigos eram Hotmail).
 */
const DOMINIOS_MICROSOFT = /@(hotmail|outlook|live|msn|windowslive)\.[a-z.]+$/i

/** A pasta certa pelo provedor do e-mail, em destaque — antes do campo do código. */
export function DicaDaCaixa({ email }: { email: string }) {
  const microsoft = DOMINIOS_MICROSOFT.test(email.trim())
  const gmail = /@gmail\.com$/i.test(email.trim())
  if (!microsoft && !gmail) return null
  return (
    <>
      {microsoft && (
        <Alert variant="warning">
          <AlertDescription>
            <strong>Usa Hotmail ou Outlook?</strong> O código costuma cair no <strong>Lixo eletrônico</strong>.
            Abra essa pasta primeiro — e, achando, marque como “Não é lixo eletrônico”.
          </AlertDescription>
        </Alert>
      )}
      {gmail && (
        <Alert variant="warning">
          <AlertDescription>
            <strong>Usa Gmail?</strong> Confira as abas <strong>Promoções</strong> e <strong>Atualizações</strong> e a
            pasta <strong>Spam</strong>.
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
