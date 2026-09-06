"use client"

import { useActionState, useState } from "react"
import { KeyRound, Loader2, Save, Trash2 } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  confirmarAcessoAction,
  corrigirAction,
  excluirAction,
  pedirCodigoAction,
} from "./actions"

export function PedirCodigo() {
  const [estado, formAction, pendente] = useActionState(pedirCodigoAction, {})

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="email">Seu e-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="o mesmo que você usou na inscrição"
          required
        />
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
        Receber código
      </Button>
      <p className="text-muted-foreground text-xs">
        Enviaremos um código para confirmar que o e-mail é seu. Nada é mostrado
        sem ele.
      </p>
    </form>
  )
}

export function ConfirmarAcesso({ token }: { token: string }) {
  const [estado, formAction, pendente] = useActionState(confirmarAcessoAction, {})

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2 sm:max-w-52">
        <Label htmlFor="codigo">Código de 6 dígitos</Label>
        <Input
          id="codigo"
          name="codigo"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          className="text-center text-lg tracking-[0.4em]"
          required
        />
      </div>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Entrar
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Se houver dados ligados a este e-mail, o código chegou por lá. Caso
        contrário, não há o que mostrar.
      </p>
    </form>
  )
}

export function Corrigir({
  token,
  nome,
  telefone,
}: {
  token: string
  nome: string | null
  telefone: string | null
}) {
  const [estado, formAction, pendente] = useActionState(corrigirAction, {})

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" defaultValue={nome ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="telefone">Telefone</Label>
        <Input id="telefone" name="telefone" defaultValue={telefone ?? ""} />
      </div>
      <p className="text-muted-foreground text-xs">
        A correção vale para todas as suas inscrições. Para trocar CPF ou
        e-mail, procure a secretaria — são os dados que identificam você.
      </p>
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar correção
        </Button>
      </div>
    </form>
  )
}

export function Excluir({
  token,
  temBiometria,
}: {
  token: string
  temBiometria: boolean
}) {
  const [estado, formAction, pendente] = useActionState(excluirAction, {})
  const [confirmacao, setConfirmacao] = useState("")

  return (
    <GrupoColapsavel
      titulo="Excluir meus dados"
      descricao="Apaga sua identificação de todas as inscrições. Não tem volta."
    >
      <form action={formAction} className="grid gap-4 pt-2">
        <input type="hidden" name="token" value={token} />
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        {estado.ok && (
          <Alert variant="success">
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
        )}

        <Alert variant="warning">
          <AlertDescription className="grid gap-2">
            <span>
              Serão apagados seu <strong>nome, CPF, e-mail, telefone</strong> e,
              se houver, sua <strong>foto</strong>.
            </span>
            <span>
              O registro de que alguém esteve presente <strong>permanece</strong>,
              sem sua identificação — é o que mantém corretos os números de
              quantas pessoas foram a cada evento.
            </span>
            {temBiometria && (
              <span>
                Sua remoção do <strong>sistema de controle de acesso</strong> é
                feita separadamente, pela equipe, e fica registrada. Ela não é
                automática.
              </span>
            )}
          </AlertDescription>
        </Alert>

        <div className="grid gap-2">
          <Label htmlFor="motivo">Motivo (opcional)</Label>
          <Textarea id="motivo" name="motivo" rows={2} />
        </div>

        <div className="grid gap-2 sm:max-w-64">
          <Label htmlFor="confirmacao">
            Digite <strong>EXCLUIR</strong> para confirmar
          </Label>
          <Input
            id="confirmacao"
            name="confirmacao"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div>
          <Button
            type="submit"
            variant="destructive"
            disabled={pendente || confirmacao.toUpperCase() !== "EXCLUIR"}
          >
            {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir meus dados
          </Button>
        </div>
      </form>
    </GrupoColapsavel>
  )
}
