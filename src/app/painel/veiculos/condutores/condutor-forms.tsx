"use client"

import { useActionState, useState, useTransition } from "react"
import { Loader2, Save, Sparkles, UserCheck, UserX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CATEGORIAS_CNH } from "@/lib/veiculos-constantes"

import { definirAutorizacaoAction, salvarCondutorAction } from "./actions"
import { lerCnh, type LeituraCnh } from "./ia-actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type Opcao = { id: string; rotulo: string }

export function CondutorForm({
  usuarios,
  dados,
}: {
  usuarios: Opcao[]
  dados?: {
    usuario_id: string
    cnh_numero: string | null
    cnh_categoria: string | null
    cnh_validade: string | null
    observacao: string | null
  }
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarCondutorAction,
    {}
  )
  const envio = useEnvioFormulario(formAction, estado)
  const k = dados?.usuario_id ?? "novo"
  // Controlados para a leitura da CNH pela IA poder preenchê-los.
  const [usuarioId, setUsuarioId] = useState(dados?.usuario_id ?? "")
  const [numero, setNumero] = useState(dados?.cnh_numero ?? "")
  const [categoria, setCategoria] = useState(dados?.cnh_categoria ?? "")
  const [validade, setValidade] = useState(dados?.cnh_validade ?? "")
  const [observacao, setObservacao] = useState(dados?.observacao ?? "")
  const [leitura, setLeitura] = useState<LeituraCnh | null>(null)
  const [lendo, iniciarLeitura] = useTransition()

  // Ao escolher o arquivo, a IA lê a carteira e preenche o que conseguiu; a
  // pessoa confere antes de salvar (o arquivo segue anexado no envio).
  function lerArquivo(arquivo: File | undefined) {
    setLeitura(null)
    if (!arquivo) return
    const fd = new FormData()
    fd.set("arquivo", arquivo)
    if (usuarioId) fd.set("usuario_id", usuarioId)
    iniciarLeitura(async () => {
      const r = await lerCnh(fd)
      setLeitura(r)
      if (r.erro) return
      if (r.numero) setNumero(r.numero)
      if (r.categoria) setCategoria(r.categoria)
      if (r.validade) setValidade(r.validade)
      if (r.observacao && !observacao.trim()) setObservacao(r.observacao)
      if (!dados && !usuarioId && r.usuarioId && usuarios.some((u) => u.id === r.usuarioId)) {
        setUsuarioId(r.usuarioId)
      }
    })
  }

  return (
    <form action={formAction} {...envio} className="grid max-w-2xl gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`cnh_arquivo-${k}`}>CNH digitalizada (PDF ou foto)</Label>
        <Input
          id={`cnh_arquivo-${k}`}
          name="cnh_arquivo"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => lerArquivo(e.target.files?.[0])}
        />
        <p className="text-muted-foreground text-xs">
          {lendo ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              Lendo a CNH…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3" />
              A IA lê a carteira e preenche nº, categoria e validade
              {dados ? "" : " — e escolhe o usuário pelo CPF"}. Confira antes de salvar.
            </span>
          )}
        </p>
        {leitura?.erro && <p className="text-destructive text-xs">{leitura.erro}</p>}
        {leitura && !leitura.erro && (
          <div className="bg-muted/40 grid gap-1 rounded-md border p-2 text-xs">
            {leitura.resumo && <p className="font-medium">Lido: {leitura.resumo}</p>}
            {(leitura.avisos ?? []).map((a) => (
              <p key={a} className="text-warning-fg">
                {a}
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`usuario-${dados?.usuario_id ?? "novo"}`}>
            Usuário *
          </Label>
          {dados ? (
            <input type="hidden" name="usuario_id" value={dados.usuario_id} />
          ) : null}
          <select
            id={`usuario-${dados?.usuario_id ?? "novo"}`}
            name={dados ? "usuario_id_visual" : "usuario_id"}
            required
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
            disabled={Boolean(dados)}
            className={SELECT}
          >
            <option value="" disabled>
              Escolha o funcionário/diretor
            </option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`cnh_numero-${dados?.usuario_id ?? "novo"}`}>
            Nº da CNH
          </Label>
          <Input
            id={`cnh_numero-${dados?.usuario_id ?? "novo"}`}
            name="cnh_numero"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`cnh_categoria-${dados?.usuario_id ?? "novo"}`}>
            Categoria
          </Label>
          <select
            id={`cnh_categoria-${dados?.usuario_id ?? "novo"}`}
            name="cnh_categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={SELECT}
          >
            <option value="">(não informada)</option>
            {CATEGORIAS_CNH.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`cnh_validade-${dados?.usuario_id ?? "novo"}`}>
            Validade da CNH
          </Label>
          <Input
            id={`cnh_validade-${dados?.usuario_id ?? "novo"}`}
            name="cnh_validade"
            type="date"
            value={validade}
            onChange={(e) => setValidade(e.target.value)}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`observacao-${dados?.usuario_id ?? "novo"}`}>
            Observação
          </Label>
          <Input
            id={`observacao-${dados?.usuario_id ?? "novo"}`}
            name="observacao"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {dados ? "Atualizar cadastro" : "Cadastrar condutor"}
        </Button>
      </div>
    </form>
  )
}

export function AutorizacaoForm({
  condutorId,
  autorizado,
  nome,
}: {
  condutorId: string
  autorizado: boolean
  nome: string
}) {
  const [estado, formAction, pendente] = useActionState(
    definirAutorizacaoAction,
    {}
  )
  const envio2 = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
        confirmarEnvio(e, autorizado
              ? `Retirar a autorização de ${nome} para dirigir?`
              : `Autorizar ${nome} a dirigir os veículos do sindicato?`)
      },
  })
  return (
    <form
      action={formAction} {...envio2}
      className="inline-flex flex-col items-end gap-1"
    >
      <input type="hidden" name="condutor_id" value={condutorId} />
      <input type="hidden" name="autorizado" value={autorizado ? "0" : "1"} />
      <Button
        type="submit"
        variant={autorizado ? "outline" : "default"}
        size="sm"
        disabled={pendente}
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : autorizado ? (
          <UserX />
        ) : (
          <UserCheck />
        )}
        {autorizado ? "Desautorizar" : "Autorizar"}
      </Button>
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
    </form>
  )
}
