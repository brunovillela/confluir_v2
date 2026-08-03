import type { Metadata } from "next"
import Link from "next/link"
import { Info } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import {
  listarAssistidos,
  listarProfissionais,
  listarTiposAtendimento,
} from "@/lib/db/atendimentos"

import { AtendimentoForm } from "../atendimento-forms"

export const metadata: Metadata = { title: "Novo atendimento — Confluir" }

export default async function NovoAtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ assistido?: string }>
}) {
  await requirePermissao("saude_atendimento", ["saude_gestao"])

  const { assistido } = await searchParams
  const [{ linhas: assistidos }, { tipos }, { linhas: profissionais }] =
    await Promise.all([
      listarAssistidos(),
      listarTiposAtendimento(),
      listarProfissionais(),
    ])

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Novo atendimento
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            O relatório clínico é escrito depois, na página do atendimento
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/painel/saude/atendimentos">Voltar à lista</Link>
        </Button>
      </div>

      {assistidos.length === 0 && (
        <Alert>
          <Info />
          <AlertDescription>
            Nenhum assistido cadastrado ainda —{" "}
            <Link
              href="/painel/saude/assistidos/novo"
              className="text-primary hover:underline"
            >
              cadastre o assistido
            </Link>{" "}
            antes de registrar o atendimento. Não filiados também podem ser
            cadastrados, basta não vincular filiado.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info />
        <AlertDescription>
          Se o assistido estiver vinculado a um filiado, este atendimento gera
          um apontamento genérico no prontuário dele — apenas “atendido pelo
          serviço de X”, sem qualquer conteúdo clínico. Atendimento a não
          filiado não gera apontamento.
        </AlertDescription>
      </Alert>

      <AtendimentoForm
        assistidos={assistidos.map((a) => ({
          id: a.id,
          nome: a.nome ?? "(sem nome)",
        }))}
        tipos={tipos}
        profissionais={profissionais}
        assistidoFixo={assistido}
      />
    </>
  )
}
