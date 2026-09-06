import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"

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
import { obterConfig, termosEmVigor } from "@/lib/db/eventos"
import { fotosGuardadas } from "@/lib/db/eventos-config"

import { ConfiguracaoForm } from "./formulario"

export const metadata: Metadata = { title: "Configuração de eventos — Confluir" }

const ROTULO_TERMO: Record<string, string> = {
  inscricao: "Inscrição",
  foto_visual: "Foto para conferência na portaria",
  foto_biometrica: "Foto para reconhecimento facial",
}

export default async function ConfiguracaoEventosPage() {
  await requirePermissao("eventos_gestao")

  const [{ config }, termos, fotos] = await Promise.all([
    obterConfig(),
    termosEmVigor(),
    fotosGuardadas(),
  ])

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/eventos">
            <ArrowLeft />
            Eventos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Configuração de eventos
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Decisões que valem para toda a entidade — principalmente a da foto,
          que define o regime legal do que é coletado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foto e controle de acesso</CardTitle>
          <CardDescription>
            Nem toda entidade tem catraca. Aqui se diz o que a sua faz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfiguracaoForm config={config} fotosGuardadas={fotos} />
        </CardContent>
      </Card>

      <GrupoColapsavel
        titulo="Termos em vigor"
        descricao="O texto que a pessoa aceita. Cada inscrição guarda qual versão foi aceita."
        resumo={<Badge variant="secondary">{termos.length}</Badge>}
      >
        <div className="grid gap-4 pt-2">
          {termos.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum termo cadastrado. Sem o termo de inscrição, o formulário
              público não tem o que apresentar para aceite.
            </p>
          ) : (
            termos.map((t) => (
              <div key={t.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="size-4" />
                  <span className="text-sm font-medium">
                    {ROTULO_TERMO[t.tipo] ?? t.tipo}
                  </span>
                  <Badge variant="outline">versão {t.versao}</Badge>
                </div>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                  {t.texto}
                </p>
              </div>
            ))
          )}
          <p className="text-muted-foreground text-xs">
            Os termos são versionados no banco: publicar uma versão nova não
            reescreve o que quem já aceitou leu.
          </p>
        </div>
      </GrupoColapsavel>
    </>
  )
}
