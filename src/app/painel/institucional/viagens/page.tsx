import type { Metadata } from "next"
import { ClipboardList, ReceiptText, Settings } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"
import { listarViagens, obterConfigViagens } from "@/lib/db/viagens"
import { listarFaturas } from "@/lib/db/viagens-faturas"

export const metadata: Metadata = { title: "Viagens — Confluir" }

/**
 * Viagens em Institucional: as três partes do trabalho — os pedidos, as
 * faturas das agências e as configurações.
 */
export default async function ViagensHubPage() {
  await requirePermissao("viagens_gestao")
  const [{ disponivel, viagens }, { faturas }, config] = await Promise.all([
    listarViagens(),
    listarFaturas().catch(() => ({ faturas: [] })),
    obterConfigViagens().catch(() => null),
  ])

  const abertas = viagens.filter(
    (v) => v.situacao === "solicitada" || v.situacao === "em_atendimento"
  ).length
  const aFaturar = viagens
    .filter((v) => v.situacao !== "recusada")
    .flatMap((v) => v.itens)
    .filter((i) => i.reservado && !i.faturaId).length
  const emAutorizacao = faturas.filter((f) => f.ordemSituacao === "Em autorização").length

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Viagens</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Viagens de diretores, funcionários e convidados que o sindicato contrata e paga.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            As tabelas de viagens ainda não existem — rode supabase/viagens.sql.
          </AlertDescription>
        </Alert>
      )}

      <div className={GRADE_AREAS}>
        <CartaoArea
          titulo="Solicitações"
          descricao="Pedidos de passagem e hospedagem, atendimento e lançamento por convidados"
          href="/painel/institucional/viagens/solicitacoes"
          icone={ClipboardList}
          indicador={`${viagens.length} no total`}
          selo={
            abertas > 0 ? (
              <Badge variant="outline" className="border-warning/40 text-warning-fg">
                {abertas} aguardando
              </Badge>
            ) : undefined
          }
        />
        <CartaoArea
          titulo="Faturas"
          descricao="Faturas das agências, rateio por conta e ordem de pagamento"
          href="/painel/institucional/viagens/faturas"
          icone={ReceiptText}
          indicador={
            emAutorizacao > 0
              ? `${faturas.length} lançadas · ${emAutorizacao} em autorização`
              : `${faturas.length} lançadas`
          }
          selo={
            aFaturar > 0 ? (
              <Badge variant="outline" className="border-info/40 text-info-fg">
                {aFaturar} a faturar
              </Badge>
            ) : undefined
          }
        />
        <CartaoArea
          titulo="Configurações"
          descricao="Centros de custo, aviso de pedidos novos, antecedência e orientações"
          href="/painel/institucional/viagens/configuracoes"
          icone={Settings}
          indicador={
            config?.emailsAviso.length
              ? `Aviso para ${config.emailsAviso.length} e-mail${config.emailsAviso.length === 1 ? "" : "s"}`
              : "Sem aviso de pedidos novos"
          }
        />
      </div>
    </>
  )
}
