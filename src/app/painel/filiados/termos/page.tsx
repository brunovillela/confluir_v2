import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  listarTermos,
  ROTULO_TIPO_TERMO,
  type TermoVersao,
  type TipoTermo,
} from "@/lib/db/filiacao-termos"
import { formatarDataHora } from "@/lib/formato"

import { AcoesVersao, TermoEditor } from "./termos-forms"

export const metadata: Metadata = { title: "Termos legais — Confluir" }

export default async function TermosPage() {
  await requirePermissao("filiacao_gestao")
  const [lgpd, desconto] = await Promise.all([
    listarTermos("lgpd"),
    listarTermos("desconto"),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Termos legais</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Textos de LGPD e de autorização de desconto que o filiado aceita na
          ficha. A versão vigente é a exibida no formulário público; as demais
          ficam no histórico.
        </p>
      </div>

      <SecaoTermo tipo="lgpd" versoes={lgpd} />
      <SecaoTermo tipo="desconto" versoes={desconto} />
    </>
  )
}

function SecaoTermo({
  tipo,
  versoes,
}: {
  tipo: TipoTermo
  versoes: TermoVersao[]
}) {
  const vigente = versoes.find((v) => v.emVigor) ?? null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{ROTULO_TIPO_TERMO[tipo]}</CardTitle>
          <FileText className="text-muted-foreground size-4" />
        </div>
        <CardDescription>
          {versoes.length} versã{versoes.length === 1 ? "o" : "es"}
          {vigente ? " · 1 vigente" : " · nenhuma vigente"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Vigente */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Badge
              variant="outline"
              className="border-success/40 text-success-fg"
            >
              Vigente
            </Badge>
            {vigente?.codigo && (
              <span className="text-muted-foreground text-xs tabular-nums">
                versão {vigente.codigo}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm whitespace-pre-wrap">
            {vigente?.texto ?? (
              <span className="text-muted-foreground">
                Nenhum termo vigente. Crie a primeira versão abaixo.
              </span>
            )}
          </p>
        </div>

        {/* Nova versão */}
        <GrupoColapsavel
          titulo="Nova versão do termo"
          descricao="Substitui a vigente; a anterior vai para o histórico"
        >
          <TermoEditor tipo={tipo} />
        </GrupoColapsavel>

        {/* Histórico */}
        {versoes.length > 0 && (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Histórico
            </p>
            {versoes.map((v) => (
              <div key={v.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {v.emVigor ? (
                      <Badge
                        variant="outline"
                        className="border-success/40 text-success-fg"
                      >
                        Vigente
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Anterior
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs tabular-nums">
                      versão {v.codigo ?? "—"} · {formatarDataHora(v.created_at)}
                    </span>
                  </div>
                  <AcoesVersao tipo={tipo} id={v.id} emVigor={v.emVigor} />
                </div>
                <p className="text-muted-foreground mt-2 line-clamp-3 text-sm whitespace-pre-wrap">
                  {v.texto ?? "—"}
                </p>
                <div className="mt-3">
                  <GrupoColapsavel titulo="Editar este texto">
                    <TermoEditor
                      tipo={tipo}
                      id={v.id}
                      textoInicial={v.texto ?? ""}
                    />
                  </GrupoColapsavel>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
