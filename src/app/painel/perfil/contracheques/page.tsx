import type { Metadata } from "next"
import { TileIndicador } from "@/components/graficos/tile"
import { hojeSP } from "@/lib/db/comum"
import { ReceiptText } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TabelaDocumentosPessoal } from "@/components/tabela-documentos-pessoal"
import { VoltarPerfil } from "@/components/voltar-perfil"
import { requireSessaoPainel } from "@/lib/auth"
import { exigirFuncionario } from "@/lib/db/perfil"
import { meusDocumentosPessoal } from "@/lib/db/pessoal"
import { lerPaginacao } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Meus contracheques — Confluir" }

/** Autosserviço: cada funcionário vê SOMENTE os próprios contracheques LIBERADOS. */
export default async function MeusContrachequesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sessao = await requireSessaoPainel()
  // Área de funcionário: diretor e demais usuários sem vínculo com o sindicato voltam ao perfil.
  await exigirFuncionario(sessao.usuario.id as string)
  const { contracheques } = await meusDocumentosPessoal(sessao.usuario.id)

  const params = await searchParams
  const pagContracheques = lerPaginacao(params, 10, "c")

  // Indicadores (padrão de 3 níveis): os mesmos números que a gestão vê, só do que foi liberado.
  const anoAtual = hojeSP().slice(0, 4)
  const anoDe = (nome: string | null, criado: string | null) => /(20\d{2})/.exec(nome ?? "")?.[1] ?? (criado ?? "").slice(0, 4)
  const noAno = contracheques.filter((c) => anoDe(c.remessaNome, c.created_at) === anoAtual).length
  return (
    <>
      <VoltarPerfil />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meus contracheques
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Contracheques liberados pelo departamento de pessoal.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo={`Contracheques em ${anoAtual}`} valor={String(noAno)} />
        {/* "Outubro/2026 - Adiantamento": o mês no número, o tipo na nota (cabe no cartão). */}
        <TileIndicador
          rotulo="Último liberado"
          valor={contracheques[0]?.remessaNome?.split(/\s+[-–—]\s+/)[0] ?? "—"}
          nota={contracheques[0]?.remessaNome?.split(/\s+[-–—]\s+/).slice(1).join(" - ") || undefined}
        />
        <TileIndicador rotulo="Disponíveis" valor={String(contracheques.length)} nota="em todo o histórico" />
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Contracheques</CardTitle>
            <ReceiptText className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {contracheques.length} liberado
            {contracheques.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaDocumentosPessoal
            documentos={contracheques}
            vazio="Nenhum contracheque liberado para você ainda."
            paginacao={pagContracheques}
            prefixo="c"
          />
        </CardContent>
      </Card>
    </>
  )
}
