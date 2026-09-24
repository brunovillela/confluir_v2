import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { listarFontesPagadoras } from "@/lib/db/fontes"

import { TrilhaVotacoes } from "../../trilha"
import { CampanhaForm, type FonteOpcao } from "../campanha-form"

export const metadata: Metadata = { title: "Nova campanha — Confluir" }

export default async function NovaCampanhaPage() {
  await requirePermissao("assembleias")

  const fontes = await listarFontesPagadoras()
  const opcoes: FonteOpcao[] = fontes.map((f) => ({
    id: f.id,
    nome: f.nome_fantasia?.trim() || f.nome_razao?.trim() || "(sem nome)",
    inativa: f.inativa === true,
  }))

  return (
    <>
      {/* Ainda não há campanha: o degrau "Campanhas" não teria para onde ir. */}
      <TrilhaVotacoes
        folha={{
          titulo: "Nova campanha",
          href: "/painel/representacao/votacoes/campanhas/nova",
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/painel/representacao/votacoes" aria-label="Voltar para votações">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Nova campanha
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            O tema que será votado nas rodadas de assembleias
          </p>
        </div>
      </div>

      <div className="max-w-3xl">
        <CampanhaForm fontes={opcoes} />
      </div>
    </>
  )
}
