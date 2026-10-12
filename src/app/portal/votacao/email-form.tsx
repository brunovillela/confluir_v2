"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, Loader2, MailCheck } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  confirmarCodigoEmailVotacao,
  enviarCodigoEmailVotacao,
} from "./actions"

/**
 * E-mail de votação verificado. Quando a empresa não cede CPF nas listas de
 * aptos, o casamento é por e-mail — por isso ele precisa ser verificado aqui.
 *
 * O e-mail do cadastro de filiado já vale sem código (a action o aceita
 * direto): ele vira um botão, em vez de obrigar a digitar o próprio e-mail
 * para descobrir que "já valia" (achado A91).
 *
 * O envio do código tem limite (A142, app/portal/votacao/limite-envio-codigo):
 * a recusa volta presa ao campo do e-mail, dizendo quanto falta. Com um código
 * pendente, o botão vira "Enviar novo código" — o novo substitui o anterior.
 */
export function EmailVotacaoForm({
  emailAtual,
  pendente,
  emailCadastro,
  preview = false,
}: {
  emailAtual: string | null
  pendente: string | null
  /** E-mail do cadastro de filiado (o mesmo que a action aceita sem código). */
  emailCadastro: string | null
  /** "Ver como filiado": o e-mail é do associado — só ele verifica o dele. */
  preview?: boolean
}) {
  const [estEnvio, actEnvio, pendEnvio] = useActionState(
    enviarCodigoEmailVotacao,
    {}
  )
  const [estConf, actConf, pendConf] = useActionState(
    confirmarCodigoEmailVotacao,
    {}
  )
  // O e-mail que se está trocando: quando o novo é verificado, ele muda e o
  // formulário fecha sozinho.
  const [trocandoDe, setTrocandoDe] = useState<string | null>(null)
  const trocando = Boolean(emailAtual) && trocandoDe === emailAtual

  const aguardandoCodigo = Boolean(pendente || estEnvio.ok?.includes("código"))
  // O atalho só faz sentido quando o e-mail do cadastro ainda não é o de votação.
  const atalhoCadastro =
    emailCadastro && emailCadastro.toLowerCase() !== emailAtual?.toLowerCase() ? emailCadastro : null
  const mostrarFormulario = !emailAtual || trocando

  return (
    <div className="grid gap-4">
      {/* Erro preso ao campo (limite de envio, e-mail inválido) aparece
          junto dele, no formulário abaixo; aqui só o que não tem campo. */}
      {estEnvio.erro && !estEnvio.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estEnvio.erro}</AlertDescription>
        </Alert>
      )}
      {estEnvio.ok && !aguardandoCodigo && (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>{estEnvio.ok}</AlertDescription>
        </Alert>
      )}

      {emailAtual && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="flex min-w-0 items-center gap-2 text-sm">
            <MailCheck className="text-success-fg size-4 shrink-0" />
            <span>
              Verificado: <span className="font-medium break-all">{emailAtual}</span>
            </span>
          </p>
          {/* Só abre/fecha o formulário — não grava nada, então fica ativo
              também na visualização da gestão. */}
          {trocando ? (
            <Button type="button" variant="ghost" onClick={() => setTrocandoDe(null)}>
              Cancelar
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setTrocandoDe(emailAtual)}>
              Trocar
            </Button>
          )}
        </div>
      )}

      {mostrarFormulario && atalhoCadastro && !aguardandoCodigo && (
        <form {...formVisualizacao(preview, actEnvio)} className="grid gap-2">
          <input type="hidden" name="email" value={atalhoCadastro} />
          <AcaoVisualizacao preview={preview} nota="">
            <Button type="submit" variant="outline" disabled={pendEnvio} className="h-auto min-h-8 py-1.5 whitespace-normal text-left">
              {pendEnvio ? <Loader2 className="animate-spin" /> : <MailCheck />}
              <span>
                Usar o e-mail do seu cadastro{" "}
                <span className="font-normal break-all">({atalhoCadastro})</span>
              </span>
            </Button>
          </AcaoVisualizacao>
          <p className="text-muted-foreground text-xs">
            Vale na hora, sem código — é o e-mail que a entidade já tem de você.
          </p>
        </form>
      )}

      {mostrarFormulario && (
        <form {...formVisualizacao(preview, actEnvio)} className="grid gap-2 sm:max-w-md">
          <ErroNoCampo estado={estEnvio} />
          <Label htmlFor="email-votacao-campo">
            {emailAtual
              ? "Novo e-mail de votação"
              : atalhoCadastro
                ? "Ou informe outro e-mail"
                : "E-mail de votação"}
          </Label>
          <div className="flex items-start gap-2">
            {/* O aviso de erro do campo entra logo abaixo do input, nesta coluna. */}
            <div className="grid min-w-0 flex-1">
              <Input
                id="email-votacao-campo"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="seu@empresa.com.br"
                defaultValue={estEnvio.email ?? pendente ?? ""}
                aria-describedby="email-votacao-ajuda"
                required
              />
            </div>
            <AcaoVisualizacao preview={preview} nota="">
              <Button type="submit" variant="outline" disabled={pendEnvio}>
                {pendEnvio ? (
                  <Loader2 className="animate-spin" />
                ) : aguardandoCodigo ? (
                  "Enviar novo código"
                ) : (
                  "Enviar código"
                )}
              </Button>
            </AcaoVisualizacao>
          </div>
          <p id="email-votacao-ajuda" className="text-muted-foreground text-xs">
            {aguardandoCodigo
              ? "Um código novo substitui o anterior. Para pedir outro, espere 1 minuto depois do último envio."
              : "Mandamos um código de 6 dígitos para confirmar que o e-mail é seu."}
          </p>
        </form>
      )}

      {aguardandoCodigo && (
        <form {...formVisualizacao(preview, actConf)} className="grid gap-2 sm:max-w-md">
          {/* Com o formulário do e-mail fechado (já há um verificado), só o
              rótulo diz para onde o código foi. */}
          <Label htmlFor="codigo" className="wrap-anywhere">
            {pendente ? `Código enviado para ${pendente}` : "Código enviado por e-mail"}
          </Label>
          {estEnvio.ok && (
            <Alert>
              <AlertDescription>{estEnvio.ok}</AlertDescription>
            </Alert>
          )}
          {/* Ligado ao campo do código (A139): o leitor de tela lê o erro ao voltar nele. */}
          {estConf.erro && (
            <Alert variant="destructive" id="codigo-erro">
              <AlertDescription>{estConf.erro}</AlertDescription>
            </Alert>
          )}
          {estConf.ok && (
            <Alert variant="success">
              <CheckCircle2 className="size-4" />
              <AlertDescription>{estConf.ok}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Input
              id="codigo"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              className="tracking-[0.4em]"
              aria-invalid={estConf.erro ? true : undefined}
              aria-describedby={estConf.erro ? "codigo-erro" : undefined}
              required
            />
            <AcaoVisualizacao preview={preview} nota="">
              <Button type="submit" disabled={pendConf}>
                {pendConf ? <Loader2 className="animate-spin" /> : "Confirmar"}
              </Button>
            </AcaoVisualizacao>
          </div>
        </form>
      )}
    </div>
  )
}
