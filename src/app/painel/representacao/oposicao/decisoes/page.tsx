import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { podeNaOposicao, regrasDaEntidade, requireOposicao } from "@/lib/db/oposicao-regras"
import { formatarDataHora } from "@/lib/formato"
import { nomeEntidade } from "@/lib/db/organizacao"
import { DECISOES_JURIDICAS, rotuloOpcao } from "@/lib/oposicao-constantes"
import { avisoPrivacidadePadrao } from "@/lib/oposicao-orientacoes"

import { AvisoPrivacidadeForm, RegrasEntidadeForm } from "../gestao-forms"

export const metadata: Metadata = { title: "Decisões jurídicas — Oposição — Confluir" }

/**
 * Decisões jurídicas padrão da entidade (28/10/2026): valem para as campanhas
 * que não decidirem diferente. Sem todas decididas (aqui ou na campanha), a
 * campanha não abre. Mudar o padrão não muda campanha já aberta: ao abrir, as
 * decisões vigentes ficam gravadas nela.
 */
export default async function DecisoesJuridicasPage() {
  const sessao = await requireOposicao("consultar")
  const [entidade, nome] = await Promise.all([regrasDaEntidade(), nomeEntidade()])
  const avisoPadrao = avisoPrivacidadePadrao(nome)
  const podeConfigurar = podeNaOposicao(sessao.permissoes, "configurar", entidade.regras.segregacao)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/oposicao">
            <ArrowLeft />
            Oposição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Decisões jurídicas</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          O padrão da entidade para as campanhas de oposição. Cada campanha pode decidir diferente (em Editar, na
          campanha). Sem todas decididas, a campanha não abre e o portal não recebe oposições.
        </p>
        {entidade.atualizadoEm && (
          <p className="text-muted-foreground mt-1 text-xs">
            Salvas em {formatarDataHora(entidade.atualizadoEm)}
            {entidade.definidoPorNome ? ` por ${entidade.definidoPorNome}` : ""}. Cada mudança fica na trilha.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Padrão da entidade</CardTitle>
          <CardDescription>
            Mudar o padrão vale para as campanhas que o seguem e ainda não foram abertas; a campanha aberta guarda as
            decisões com que abriu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {podeConfigurar ? (
            <RegrasEntidadeForm regras={entidade.regras} />
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              {DECISOES_JURIDICAS.map((d) => (
                <div key={d.chave}>
                  <dt className="text-muted-foreground text-xs">{d.rotulo}</dt>
                  <dd className="mt-0.5 text-sm">{rotuloOpcao(d.chave, entidade.regras[d.chave]) ?? "Não decidido"}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aviso de privacidade da oposição</CardTitle>
          <CardDescription>
            Aparece junto das instruções da campanha, antes de a pessoa se opor; ela marca que leu e clica em “Li e
            quero prosseguir”. O filiado aceita também o termo de privacidade geral da entidade, se ainda não aceitou
            a versão em vigor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {podeConfigurar ? (
            <AvisoPrivacidadeForm atual={entidade.avisoPrivacidade} padrao={avisoPadrao} />
          ) : (
            <div className="bg-muted/30 rounded-lg border p-3 text-sm whitespace-pre-line">
              {entidade.avisoPrivacidade ?? avisoPadrao}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
