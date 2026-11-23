import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, LayoutTemplate } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarModelos } from "@/lib/db/modelos"
import { listarPessoasAtribuiveis } from "@/lib/db/nucleo"
import { listarFormularios } from "@/lib/db/pedidos"

import { FormularioPedidoForm, NovoModelo } from "./modelos-forms"

export const metadata: Metadata = { title: "Modelos e pedidos — Confluir" }

/** Modelos de demanda e de projeto, e os formulários de pedido (Onda 3). */
export default async function ModelosPage() {
  await requirePermissao("ferramentas_demandas")
  const [modelos, formularios, pessoas] = await Promise.all([listarModelos(), listarFormularios(), listarPessoasAtribuiveis()])
  const modelosDemanda = modelos.filter((m) => m.tipo === "demanda").map((m) => ({ id: m.id, nome: m.nome }))

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/painel/ferramentas">
          <ArrowLeft />
          Ferramentas
        </Link>
      </Button>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <LayoutTemplate className="text-muted-foreground size-5" />
          Modelos e pedidos
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Modelos montam as tarefas (e os marcos do projeto) de uma vez, com os prazos contados a partir de uma data. Os formulários
          de pedido transformam o pedido de qualquer pessoa do painel numa demanda do setor.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4">
          <div>
            <p className="text-sm font-medium">Modelos</p>
            <p className="text-muted-foreground text-xs">
              Use em Demandas (&quot;Nova a partir de modelo&quot; e &quot;Aplicar modelo&quot;) e na página do projeto. Uma demanda
              pronta também vira modelo, em &quot;Salvar como modelo&quot;.
            </p>
          </div>
          {modelos.length > 0 && (
            <ul className="grid divide-y">
              {modelos.map((m) => {
                const tarefas = m.itens.filter((i) => i.tipo === "tarefa").length
                const marcos = m.itens.filter((i) => i.tipo === "marco").length
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/painel/ferramentas/modelos/${m.id}`} className="text-primary font-medium hover:underline">
                      {m.nome}
                    </Link>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      <Badge variant="outline">{m.tipo === "projeto" ? "Projeto" : "Demanda"}</Badge>
                      {tarefas} tarefa{tarefas === 1 ? "" : "s"}
                      {m.tipo === "projeto" ? ` · ${marcos} marco${marcos === 1 ? "" : "s"}` : ""}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <NovoModelo />
        </CardContent>
      </Card>

      <Card id="formularios">
        <CardContent className="grid gap-4">
          <div>
            <p className="text-sm font-medium">Formulários de pedido</p>
            <p className="text-muted-foreground text-xs">
              Aparecem em <Link href="/painel/pedidos" className="underline">Pedidos</Link>, para qualquer pessoa do painel. Cada
              pedido vira uma demanda de quem recebe, com as tarefas do modelo; quem pediu acompanha em Meus pedidos e é avisado
              quando a demanda vai para Feito.
            </p>
          </div>
          {formularios.map((f) => (
            <div key={f.id} className="rounded-md border p-3">
              <FormularioPedidoForm formulario={f} pessoas={pessoas} modelos={modelosDemanda} />
            </div>
          ))}
          <div className="bg-muted/40 rounded-md border border-dashed p-3">
            <p className="mb-2 text-sm font-medium">Novo formulário</p>
            <FormularioPedidoForm pessoas={pessoas} modelos={modelosDemanda} />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
