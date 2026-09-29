import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ListChecks, ScrollText } from "lucide-react"

import { AbrirFormulario } from "@/app/painel/institucional/organizacao/abrir-formulario"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  AVISO_SQL_CONFIG,
  listarClausulasFixas,
  listarTiposMinuta,
} from "@/lib/db/contratos-minutas-config"

import { ClausulaForm, ExcluirClausula, TipoForm } from "./config-forms"

export const metadata: Metadata = { title: "Configuração das minutas — Confluir" }

export default async function ConfiguracaoMinutasPage() {
  await requirePermissao("aquisicoes_contratos_edicao")
  const [{ disponivel, tipos }, { clausulas }] = await Promise.all([
    listarTiposMinuta(),
    listarClausulasFixas(),
  ])
  const nomeTipo = new Map(tipos.map((t) => [t.id, t.nome]))

  return (
    <>
      <RotuloTrilha valores={{ configuracao: "Configuração" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/contratos/minutas">
            <ArrowLeft />
            Minutas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Configuração das minutas</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cláusulas que a entidade exige em todo contrato e os tipos de contrato oferecidos na criação
        </p>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_CONFIG}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="text-muted-foreground size-4" />
            Cláusulas fixas
          </CardTitle>
          <CardDescription>
            Entram, com o texto exato, em toda minuta nova (ou só nos tipos marcados). A IA apenas numera e
            encaixa; a tela da minuta avisa se alguma sumir do texto.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {clausulas.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nenhuma cláusula fixa. Exemplos: isenção da entidade por vício do produto ou serviço do
              fornecedor; proteção de dados pessoais (LGPD); ausência de vínculo empregatício.
            </p>
          )}
          {clausulas.map((c) => (
            <div key={c.id} className="rounded-lg border p-3">
              <AbrirFormulario
                rotulo="Editar"
                resumo={
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.titulo}</span>
                      {!c.ativa && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inativa
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-muted-foreground">
                        {c.tipos.length === 0
                          ? "Todos os tipos"
                          : c.tipos.map((id) => nomeTipo.get(id) ?? "?").join(", ")}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground line-clamp-3 text-xs whitespace-pre-line">{c.texto}</p>
                  </div>
                }
              >
                <ClausulaForm clausula={c} tipos={tipos} />
                <div className="flex justify-end">
                  <ExcluirClausula id={c.id} />
                </div>
              </AbrirFormulario>
            </div>
          ))}
          {disponivel && (
            <AbrirFormulario rotulo="Nova cláusula fixa" icone="novo">
              <ClausulaForm tipos={tipos} />
            </AbrirFormulario>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="text-muted-foreground size-4" />
            Tipos de contrato
          </CardTitle>
          <CardDescription>
            O que aparece para escolher na nova minuta. A orientação diz à IA o que um contrato desse tipo
            precisa conter.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {tipos.map((t) => (
            <div key={t.id} className="rounded-lg border p-3">
              <AbrirFormulario
                rotulo="Editar"
                resumo={
                  <div className="grid gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={t.ativo ? "font-medium" : "text-muted-foreground font-medium"}>{t.nome}</span>
                      {!t.ativo && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    {t.descricao && <p className="text-muted-foreground text-xs">{t.descricao}</p>}
                  </div>
                }
              >
                <TipoForm tipo={t} />
              </AbrirFormulario>
            </div>
          ))}
          {disponivel && (
            <AbrirFormulario rotulo="Novo tipo" icone="novo">
              <TipoForm />
            </AbrirFormulario>
          )}
        </CardContent>
      </Card>
    </>
  )
}
