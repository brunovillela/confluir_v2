"use client"

import { startTransition, useActionState, type ReactNode } from "react"
import { Loader2, Save } from "lucide-react"

import { CartaoEditavel } from "@/components/cartao-editavel"
import { CamposDadosBancarios, type ValoresDadosBancarios } from "@/components/dados-bancarios-campos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"
import { lerDocumentoTitular } from "@/lib/cpf"
import { rotuloTipoConta } from "@/lib/contracheques-constantes"

import { salvarDadosBancariosAction } from "./actions"

export type DadosBancariosTela = ValoresDadosBancarios

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm break-words">{valor || "—"}</dd>
    </div>
  )
}

/** Conta e Pix do funcionário — destino das ordens de pagamento da folha. */
export function DadosBancariosFuncionario({
  usuarioId,
  dados,
  cpfFuncionario,
  acoes,
}: {
  usuarioId: string
  dados: DadosBancariosTela | null
  /** Sugestão para o titular quando a conta ainda não tem o documento. */
  cpfFuncionario?: string | null
  /** Botões extras no cabeçalho do cartão (ex.: Pedir dados bancários). */
  acoes?: ReactNode
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarDadosBancariosAction,
    {}
  )

  return (
    <div id="dados-bancarios" className="scroll-mt-20">
      <CartaoEditavel
        titulo="Dados bancários"
        descricao="Onde cai o pagamento das ordens geradas pelos contracheques"
        abertoInicial={!dados}
        acoes={acoes}
        resumo={
          dados ? (
            <dl className="grid gap-3 sm:grid-cols-3">
              <Campo
                rotulo="Banco"
                valor={[dados.banco, dados.bancoCodigo ? `(${dados.bancoCodigo})` : null].filter(Boolean).join(" ")}
              />
              <Campo rotulo="Agência" valor={dados.agencia} />
              <Campo
                rotulo="Conta"
                valor={[dados.conta, rotuloTipoConta(dados.tipoConta)].filter(Boolean).join(" · ")}
              />
              <Campo rotulo="Chave Pix" valor={[dados.pixTipo, dados.pix].filter(Boolean).join(": ")} />
              <Campo rotulo="Favorecido" valor={dados.favorecido} />
              <Campo rotulo="Pagar por" valor={dados.preferePix ? "Pix" : "Conta bancária"} />
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">Sem dados bancários.</p>
          )
        }
      >
        {/* Envio por startTransition: com `action={formAction}` o React 19
            reinicia o formulário depois de um erro e o que foi digitado some. */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const dados = new FormData(e.currentTarget)
            startTransition(() => formAction(dados))
          }}
          className="grid gap-3"
        >
          <input type="hidden" name="usuario_id" value={usuarioId} />
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {estado.ok && (
            <Alert className="border-success/40 text-success-fg">
              <AlertDescription>{estado.ok}</AlertDescription>
            </Alert>
          )}
          <CamposDadosBancarios
            valores={dados}
            titularSugerido={lerDocumentoTitular(cpfFuncionario).documento}
          />
          <div>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar dados bancários
            </Button>
          </div>
        </form>
      </CartaoEditavel>
    </div>
  )
}
