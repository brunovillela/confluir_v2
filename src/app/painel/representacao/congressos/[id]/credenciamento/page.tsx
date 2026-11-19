import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { valor } from "@/lib/congressos/config"
import { obterCongresso } from "@/lib/db/congressos"
import { dadosDoDia, painelDoDia } from "@/lib/db/congressos-dia"

import { Mesa } from "./mesa"

export const metadata: Metadata = { title: "Mesa de credenciamento — Confluir" }

export default async function CredenciamentoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("congressos_credenciamento", ["congressos_gestao"])
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  const [d, painel] = await Promise.all([dadosDoDia(id), painelDoDia(c)])
  const substituidos = new Set(d.trocas.map((t) => t.titularId))
  const titulares = d.participantes
    .filter((p) => {
      const cat = p.papelId ? d.papelPorId.get(p.papelId)?.categoria : null
      return (cat === "delegado" || cat === "nato") && !substituidos.has(p.id)
    })
    .map((p) => ({
      id: p.id,
      nome: p.nomeSocial ?? p.nome,
      base: p.unidadeId ? (d.unidades.find((u) => u.id === p.unidadeId)?.nome ?? null) : null,
      credenciado: !!p.credenciadoEm,
    }))
  const troca = valor<string>(c.config, "credenciamento.autoriza_troca")
  const base = `/painel/representacao/congressos/${id}`

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, credenciamento: "Credenciamento" }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mesa de credenciamento</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {painel.credenciados} de {painel.inscritosConfirmados} confirmados credenciados
            {painel.aDistancia ? ` (${painel.aDistancia} a distância)` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/contingencia`} target="_blank">
              Lista de contingência (PDF)
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}?aba=dia`}>Painel do dia</Link>
          </Button>
        </div>
      </div>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Quem chegou</CardTitle>
          <CardDescription>
            Busque pelo nome ou CPF, ou leia o QR do crachá ou do link pessoal no celular da pessoa. O crachá sai para a
            impressora ao credenciar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Mesa
            congressoId={id}
            exigeDocumento={valor(c.config, "credenciamento.documento_foto") === true}
            permiteDistancia={valor(c.config, "identidade.formato") !== "presencial"}
            autorizacao={troca === "ninguem" ? null : troca === "comissao" ? "comissão" : "coordenação da base"}
            titulares={titulares}
            segundaViaProibida={valor(c.config, "credenciamento.segunda_via") === "proibida"}
          />
        </CardContent>
      </Card>
    </>
  )
}
