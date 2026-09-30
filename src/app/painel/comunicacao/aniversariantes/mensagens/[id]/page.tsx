import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PADRAO_ANIVERSARIO } from "@/lib/comunicacao-mensagens-constantes"
import { requirePermissao } from "@/lib/auth"
import { obterConfigAniversario, obterModelo } from "@/lib/db/comunicacao-mensagens"
import { baseRelatorios } from "@/lib/db/filiacao-relatorios"
import { nomeEntidade } from "@/lib/db/organizacao"

import { excluirModeloAction } from "../../actions"
import { EditorParabens } from "../../componentes"

export const metadata: Metadata = { title: "Mensagem específica — Confluir" }

/** Uma mensagem de parabéns específica: quem a recebe e o texto. `nova` cria. */
export default async function MensagemEspecificaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("comunicacao_mensagens")
  const { id } = await params
  const { salvo } = await searchParams
  const nova = id === "nova"
  const [modelo, config, entidade, base] = await Promise.all([
    nova ? null : obterModelo(id),
    obterConfigAniversario(),
    nomeEntidade(),
    baseRelatorios(),
  ])
  if (!nova && !modelo) notFound()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao/aniversariantes/mensagens">
            <ArrowLeft />
            Mensagens e envio
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{nova ? "Nova mensagem específica" : modelo!.nome}</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Quem atende os critérios recebe esta mensagem no lugar da padrão.
        </p>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <AlertDescription>Mensagem criada.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <EditorParabens
            modo="especifica"
            inicial={
              modelo ?? {
                // Começa do texto padrão: é mais fácil adaptar do que escrever do zero.
                assunto: config.assunto || PADRAO_ANIVERSARIO.assunto,
                mensagem: config.mensagem || PADRAO_ANIVERSARIO.mensagem,
                textoWhatsapp: config.textoWhatsapp || PADRAO_ANIVERSARIO.textoWhatsapp,
                ativo: true,
              }
            }
            fontes={base.fontes}
            exemploNome={String(sessao.usuario.nome_completo ?? "Maria da Silva")}
            entidade={entidade}
          />
        </CardContent>
      </Card>

      {modelo && (
        <form action={excluirModeloAction} className="flex justify-end">
          <input type="hidden" name="id" value={modelo.id} />
          <Button type="submit" variant="ghost" size="sm" className="text-destructive">
            <Trash2 />
            Excluir esta mensagem
          </Button>
        </form>
      )}
    </>
  )
}
