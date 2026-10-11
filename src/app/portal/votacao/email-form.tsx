"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, Loader2, MailCheck } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
      {estEnvio.erro && (
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
          <Label htmlFor="email-votacao-campo">
            {emailAtual
              ? "Novo e-mail de votação"
              : atalhoCadastro
                ? "Ou informe outro e-mail"
                : "E-mail de votação"}
          </Label>
          <div className="flex gap-2">
            <Input
              id="email-votacao-campo"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="seu@empresa.com.br"
              defaultValue={pendente ?? ""}
              required
            />
            <AcaoVisualizacao preview={preview} nota="">
              <Button type="submit" variant="outline" disabled={pendEnvio}>
                {pendEnvio ? <Loader2 className="animate-spin" /> : "Enviar código"}
              </Button>
            </AcaoVisualizacao>
          </div>
          <p className="text-muted-foreground text-xs">
            Mandamos um código de 6 dígitos para confirmar que o e-mail é seu.
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
          {estConf.erro && (
            <Alert variant="destructive">
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
