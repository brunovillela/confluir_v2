"use client"

import { useEffect, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * CONFIRMAÇÃO PADRÃO (onda 2, U5): no lugar do `confirm()` do navegador — a
 * caixa cinza sem contexto — um diálogo do sistema com título, explicação e
 * o verbo da ação no botão (vermelho quando destrói algo).
 *
 * Uso:
 *   • `onSubmit={(e) => confirmarEnvio(e, "Excluir esta notícia?")}` num
 *     formulário (ou `onClick` num botão de envio): segura o envio, pergunta
 *     e, confirmado, envia o mesmo formulário com o mesmo botão.
 *   • `if (!(await confirmar("Cancelar o cupom? Não dá para desfazer."))) return`
 *     em qualquer handler assíncrono.
 *
 * Uma string vira título (até o "?") e explicação (o resto). Verbos como
 * excluir, remover, cancelar e encerrar marcam a ação como destrutiva e vão
 * para o botão. `<ConfirmacaoHost />` fica montado uma vez no layout raiz;
 * sem ele (teste, página fora do app), cai no `window.confirm`.
 */

export type OpcoesConfirmacao = {
  titulo?: string
  descricao?: string
  /** Rótulo do botão que confirma (padrão: o verbo da pergunta ou "Confirmar"). */
  confirmar?: string
  cancelar?: string
  destrutivo?: boolean
}

const VERBOS_DESTRUTIVOS = [
  "excluir", "remover", "apagar", "cancelar", "encerrar", "rejeitar", "desvincular", "desfazer",
  "reprovar", "recusar", "estornar", "bloquear", "desligar", "anular", "limpar", "zerar", "revogar",
  "descartar", "inativar", "finalizar", "desativar", "retirar", "arquivar", "devolver", "redefinir",
]
const VERBOS_BOTAO = [
  ...VERBOS_DESTRUTIVOS,
  "aprovar", "autorizar", "concluir", "confirmar", "enviar", "efetivar", "gerar", "liberar", "publicar",
  "registrar", "salvar", "lançar", "aplicar", "unificar", "mesclar", "reabrir", "reenviar", "marcar",
  "trocar", "pagar", "baixar", "fechar", "abrir", "importar", "exportar", "sair", "entrar", "reservar",
]

function normalizar(o: string | OpcoesConfirmacao): Required<OpcoesConfirmacao> {
  const base: OpcoesConfirmacao = typeof o === "string" ? {} : o
  const textoBase = typeof o === "string" ? o : (base.descricao ?? "")
  let titulo = base.titulo
  let descricao = typeof o === "string" ? "" : (base.descricao ?? "")
  if (!titulo) {
    const corte = textoBase.indexOf("?")
    if (corte >= 0) {
      titulo = textoBase.slice(0, corte + 1).trim()
      descricao = textoBase.slice(corte + 1).trim()
    } else {
      titulo = textoBase.trim() || "Confirmar?"
      descricao = ""
    }
  }
  const primeira = (titulo.split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-zà-ú]/g, "")
  const destrutivo = base.destrutivo ?? VERBOS_DESTRUTIVOS.includes(primeira)
  const verbo = VERBOS_BOTAO.includes(primeira) ? primeira.charAt(0).toUpperCase() + primeira.slice(1) : "Confirmar"
  return {
    titulo,
    descricao,
    confirmar: base.confirmar ?? verbo,
    cancelar: base.cancelar ?? "Voltar",
    destrutivo,
  }
}

type Pedido = { opcoes: Required<OpcoesConfirmacao>; resolver: (ok: boolean) => void }

let abrirPedido: ((p: Pedido) => void) | null = null

/** Pergunta e devolve a resposta; sem o host montado, usa o confirm nativo. */
export function confirmar(o: string | OpcoesConfirmacao): Promise<boolean> {
  const opcoes = normalizar(o)
  if (!abrirPedido) {
    return Promise.resolve(window.confirm([opcoes.titulo, opcoes.descricao].filter(Boolean).join(" ")))
  }
  return new Promise<boolean>((resolver) => abrirPedido?.({ opcoes, resolver }))
}

/**
 * Para `onSubmit` de formulário ou `onClick` de botão de envio: segura o
 * envio, pergunta e, confirmado, envia o formulário com o mesmo botão.
 */
export function confirmarEnvio(
  e: React.SyntheticEvent<HTMLElement>,
  o: string | OpcoesConfirmacao
): void {
  const alvo = e.currentTarget as HTMLElement
  // Segunda passagem (o reenvio/reclique depois do "sim"): deixa seguir.
  if (alvo.dataset.confirmado === "1") {
    delete alvo.dataset.confirmado
    return
  }
  e.preventDefault()
  void confirmar(o).then((ok) => {
    if (!ok) return
    if (alvo instanceof HTMLFormElement) {
      const botao = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null) ?? undefined
      alvo.dataset.confirmado = "1"
      alvo.requestSubmit(botao)
    } else if (alvo instanceof HTMLButtonElement && alvo.form) {
      // requestSubmit não dispara o clique de novo: sem marca.
      alvo.form.requestSubmit(alvo)
    } else {
      alvo.dataset.confirmado = "1"
      alvo.click()
    }
  })
}

/** Montado uma vez (layout raiz): o único diálogo que atende todos os `confirmar`. */
export function ConfirmacaoHost() {
  const [pedido, setPedido] = useState<Pedido | null>(null)

  useEffect(() => {
    abrirPedido = (p) => setPedido(p)
    return () => {
      abrirPedido = null
    }
  }, [])

  const responder = (ok: boolean) => {
    pedido?.resolver(ok)
    setPedido(null)
  }

  const o = pedido?.opcoes
  return (
    <AlertDialog open={pedido !== null} onOpenChange={(aberto) => !aberto && responder(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{o?.titulo}</AlertDialogTitle>
          <AlertDialogDescription className={cn(!o?.descricao && "sr-only")}>
            {o?.descricao || "Confirme para continuar."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => responder(false)}>{o?.cancelar}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(o?.destrutivo && buttonVariants({ variant: "destructive" }))}
            onClick={() => responder(true)}
          >
            {o?.confirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
