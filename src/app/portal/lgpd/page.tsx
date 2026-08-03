import type { Metadata } from "next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireSessaoPortal } from "@/lib/auth"
import { cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"

import { PortalShell } from "../portal-shell"
import { AceiteLgpdForm } from "./aceite-form"

export const metadata: Metadata = { title: "LGPD — Portal do Associado" }

const DIREITOS = [
  "Confirmar a existência de tratamento dos seus dados e acessá-los.",
  "Corrigir dados incompletos, inexatos ou desatualizados (use a página Meu cadastro para contato e endereço).",
  "Solicitar anonimização, bloqueio ou eliminação de dados desnecessários.",
  "Solicitar a portabilidade dos dados a outro fornecedor de serviço.",
  "Revogar o consentimento, quando o tratamento se basear nele.",
]

export default async function LgpdPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  const { filiado } = await requireSessaoPortal()
  const { salvo } = await searchParams
  const [cadastro, org] = await Promise.all([
    cadastroDoFiliado(filiado.cpf),
    obterOrganizacao(),
  ])
  const emailContato = org?.emailContato ?? null

  const aceiteLgpd = cadastro?.tl_lgpd_data ?? null
  const aceiteDesconto = cadastro?.tl_desconto_data ?? null

  return (
    <PortalShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          LGPD — dados pessoais
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Seus aceites e seus direitos sobre o tratamento de dados pessoais
          (Lei nº 13.709/2018).
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Aceite registrado. Obrigado!</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Termo LGPD</CardDescription>
            <CardTitle className="text-base">
              {aceiteLgpd ? (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Aceito em {formatarData(aceiteLgpd)}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-warning/40 text-warning-fg">
                  Aceite não registrado
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Desconto em folha</CardDescription>
            <CardTitle className="text-base">
              {aceiteDesconto ? (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Autorizado em {formatarData(aceiteDesconto)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Sem registro
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Termo de tratamento de dados</CardTitle>
          <CardDescription>
            Como o Sindipetro-NF usa seus dados pessoais
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-muted-foreground text-sm">
            O Sindipetro-NF trata seus dados cadastrais (identificação, contato,
            endereço e vínculos de filiação) para as finalidades da atividade
            sindical: gestão da filiação e das contribuições, comunicação com o
            associado, prestação de serviços e benefícios (como convênios de
            hospedagem, ações jurídicas e de saúde) e cumprimento de obrigações
            legais. Os dados não são vendidos e só são compartilhados com
            terceiros quando necessário à prestação do serviço (por exemplo, o
            hotel parceiro recebe seu nome para a reserva) ou por obrigação
            legal.
          </p>
          {!aceiteLgpd && <AceiteLgpdForm />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seus direitos como titular</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ul className="text-muted-foreground grid list-disc gap-1 pl-5 text-sm">
            {DIREITOS.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="text-sm">
            Para exercer qualquer direito, fale com a secretaria do sindicato
            {emailContato ? (
              <>
                {" "}
                ou escreva para{" "}
                <a
                  href={`mailto:${emailContato}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {emailContato}
                </a>
              </>
            ) : null}
            .
          </p>
        </CardContent>
      </Card>
    </PortalShell>
  )
}
