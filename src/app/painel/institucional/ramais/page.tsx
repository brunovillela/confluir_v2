import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, PhoneCall } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarLinhasInstitucionais, opcoesResponsaveisLinha } from "@/lib/db/linhas-institucionais"
import { listarRamais } from "@/lib/db/ramais"
import { formatarTelefone } from "@/lib/formato"

import { FormularioRamal, LinhaRamal } from "./ramais-forms"

export const metadata: Metadata = { title: "Ramais e telefones diretos — Confluir" }

/**
 * Institucional › Ramais e telefones diretos: as linhas fixas da entidade e
 * quem atende em cada uma. O Meu perfil espelha os da pessoa em "Contatos
 * corporativos". Mesma permissão das Linhas institucionais.
 */
export default async function RamaisPage() {
  await requirePermissao("ferramentas_linhas_telefone", ["configuracoes"])
  const [{ disponivel, ramais }, linhas] = await Promise.all([listarRamais(), listarLinhasInstitucionais()])
  // Mesmas pessoas que podem ficar com uma linha (funcionários e diretores),
  // mais quem já atende num ramal e saiu do quadro.
  const responsaveis = await opcoesResponsaveisLinha([
    ...linhas,
    ...ramais
      .filter((r) => r.usuarioId)
      .map((r) => ({ id: r.id, numero: "", operadora: null, chip: null, usuarioId: r.usuarioId, responsavelNome: r.responsavelNome, observacao: null })),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Ramais e telefones diretos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          As linhas fixas da entidade e quem atende em cada uma · {ramais.length} cadastrado{ramais.length === 1 ? "" : "s"}. O
          ramal e o telefone direto de cada pessoa aparecem no Meu perfil dela, em Contatos corporativos.
        </p>
      </div>

      {!disponivel ? (
        <Alert variant="warning">
          <AlertDescription>A migração desta área ainda não foi aplicada no banco.</AlertDescription>
        </Alert>
      ) : (
        <>
          <GrupoColapsavel titulo="Adicionar ramal" descricao="Ramal, telefone direto ou os dois">
            <FormularioRamal responsaveis={responsaveis} />
          </GrupoColapsavel>

          <Card>
            <CardContent>
              {ramais.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  <PhoneCall className="mx-auto mb-2 size-5" />
                  Nenhum ramal cadastrado ainda.
                </p>
              ) : (
                <ul className="divide-y">
                  {ramais.map((r) => (
                    <LinhaRamal key={r.id} ramal={r} responsaveis={responsaveis}>
                      <div className="grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[6rem_10rem_1fr_1fr]">
                        <span className="font-medium tabular-nums">{r.ramal ? `Ramal ${r.ramal}` : "—"}</span>
                        <span className="tabular-nums">{r.telefoneDireto ? formatarTelefone(r.telefoneDireto) : "—"}</span>
                        <span className="truncate">{r.responsavelNome ?? <span className="text-muted-foreground">Uso geral</span>}</span>
                        <span className="text-muted-foreground truncate">
                          {[r.local, r.observacao].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </div>
                    </LinhaRamal>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
