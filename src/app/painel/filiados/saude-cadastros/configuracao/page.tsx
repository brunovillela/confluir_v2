import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { configSaudeCadastros } from "@/lib/db/organizacao"
import { configSaudePadrao } from "@/lib/saude-cadastros"

import { ConfigSaudeForm } from "./config-saude-form"

export const metadata: Metadata = { title: "Configurar saúde dos cadastros — Confluir" }

/** Peso de cada falta de informação, por categoria de fonte pagadora. */
export default async function ConfigSaudeCadastrosPage() {
  const sessao = await requirePermissao("filiacao_gestao")
  const podeGerirCategorias = podeAcessar(sessao.permissoes, "empregadores")
  const { config, categorias, disponivel } = await configSaudeCadastros()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Configurar saúde dos cadastros
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Para cada categoria de fonte pagadora, diga o que a falta de cada
          informação significa. Só <strong>pendência</strong> derruba a saúde e
          põe o cadastro na lista de pendentes; <strong>apontamento</strong>{" "}
          aparece na lista como aviso; <strong>normal</strong> não é verificado.
          Vale a categoria da fonte do vínculo em aberto do filiado — sem
          vínculo em aberto, vale a de Empregador. Há uma aba por categoria de
          fonte, inclusive as criadas pela entidade.
        </p>
      </div>

      {!disponivel && (
        <Alert className="border-warning/40">
          <AlertDescription>
            Rode <code>supabase/empresa-filiacao-saude-config.sql</code> para
            poder salvar. Até lá vale o padrão do sistema.
          </AlertDescription>
        </Alert>
      )}

      <ConfigSaudeForm
        inicial={config}
        padrao={configSaudePadrao(categorias)}
        categorias={categorias}
        podeGerirCategorias={podeGerirCategorias}
      />
    </>
  )
}
