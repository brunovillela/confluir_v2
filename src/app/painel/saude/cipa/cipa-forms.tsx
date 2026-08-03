"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Save, Trash2, Upload, UserPlus, X } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SITUACOES_CIPA, type ReuniaoCipa } from "@/lib/cipa-constantes"

import {
  adicionarRepresentanteAction,
  comparecimentoAction,
  enviarAtaAction,
  excluirReuniaoAction,
  removerRepresentanteAction,
  salvarReuniaoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const AREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

export function ReuniaoForm({
  reuniao,
  empresas,
}: {
  reuniao?: ReuniaoCipa
  empresas: EmpresaOpcao[]
}) {
  const [estado, formAction, pendente] = useActionState(salvarReuniaoAction, {})

  return (
    <form action={formAction} className="grid gap-4">
      {reuniao && <input type="hidden" name="id" value={reuniao.id} />}

      {/*
        A `key` remonta os campos a cada tentativa. É o que reconcilia o reset
        de formulário do React 19 com o eco devolvido pela action: sem
        remontar, o estado controlado de `situacao` poderia já estar correto
        sem provocar re-render, e o <select> continuaria exibindo o valor do
        reset — "Convidado" com o campo de motivo aberto logo abaixo.
      */}
      <CamposReuniao
        key={estado.tentativa ?? 0}
        reuniao={reuniao}
        empresas={empresas}
        valores={estado.valores}
      />

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {reuniao ? "Salvar alterações" : "Registrar reunião"}
        </Button>
      </div>
    </form>
  )
}

function CamposReuniao({
  reuniao,
  empresas,
  valores,
}: {
  reuniao?: ReuniaoCipa
  empresas: EmpresaOpcao[]
  /** Eco da action quando a validação recusou o envio. */
  valores?: Record<string, string>
}) {
  // O eco tem prioridade sobre o registro em edição: é o que o usuário
  // acabou de digitar e não deve perder por causa de um campo faltando.
  const v = (campo: string, atual: string | null | undefined) =>
    valores?.[campo] ?? atual ?? ""
  const marcado = (campo: string, atual: boolean | null | undefined) =>
    valores ? valores[campo] === "1" : (atual ?? false)

  const [situacao, setSituacao] = useState(
    valores?.situacao ?? reuniao?.situacao ?? "convidado"
  )
  const exigeMotivo = situacao === "recusado" || situacao === "nao_compareceu"

  return (
    <Card>
      <CardContent className="grid gap-4">
        <p className="text-sm font-medium">Reunião</p>

        <div className="grid gap-1.5">
          <Label>Empresa</Label>
          <EmpresaCombobox
            empresas={empresas}
            name="empresa_id"
            defaultId={valores?.empresa_id || reuniao?.empresa_id || undefined}
          />
          <p className="text-muted-foreground text-xs">
            A CIPA é da empresa — é por ela que a frequência de convites é
            medida.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="data_reuniao">Data da reunião *</Label>
            <Input
              id="data_reuniao"
              name="data_reuniao"
              type="date"
              required
              defaultValue={v("data_reuniao", reuniao?.data_reuniao)}
              className="[color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="convite_recebido_em">Convite recebido em</Label>
            <Input
              id="convite_recebido_em"
              name="convite_recebido_em"
              type="date"
              defaultValue={v(
                "convite_recebido_em",
                reuniao?.convite_recebido_em
              )}
              className="[color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="unidade">Unidade / plataforma</Label>
            <Input
              id="unidade"
              name="unidade"
              defaultValue={v("unidade", reuniao?.unidade)}
              placeholder="Unidade, base, plataforma…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="situacao">Situação *</Label>
            {/*
              NÃO-controlado de propósito. O reset de formulário do React 19
              roda DEPOIS da renderização e sobrescreve o DOM sem avisar o
              React: um <select value={...}> voltaria a exibir a primeira
              opção enquanto o estado dizia outra coisa. Com defaultValue, o
              reset restaura justamente o eco. O estado abaixo serve só para
              decidir se o campo de motivo aparece.
            */}
            <select
              id="situacao"
              name="situacao"
              defaultValue={situacao}
              onChange={(e) => setSituacao(e.target.value)}
              className={SELECT}
            >
              {SITUACOES_CIPA.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="ordinaria"
              defaultChecked={
                valores
                  ? marcado("ordinaria", true)
                  : (reuniao?.ordinaria ?? true)
              }
            />
            Ordinária
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="online"
              defaultChecked={marcado("online", reuniao?.online)}
            />
            Online
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="demanda_embarque"
              defaultChecked={marcado(
                "demanda_embarque",
                reuniao?.demanda_embarque
              )}
            />
            Demanda embarque
          </label>
        </div>

        {exigeMotivo && (
          <div className="grid gap-1.5">
            <Label htmlFor="motivo_ausencia">
              Motivo da {situacao === "recusado" ? "recusa" : "ausência"} *
            </Label>
            <Input
              id="motivo_ausencia"
              name="motivo_ausencia"
              required
              defaultValue={v("motivo_ausencia", reuniao?.motivo_ausencia)}
              placeholder="Sem diretor disponível, aviso em cima da hora…"
            />
            <p className="text-muted-foreground text-xs">
              É o motivo que dá sentido à estatística — sem ele, só se sabe que
              faltamos.
            </p>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="motivo_especifico">Motivo específico da reunião</Label>
          <Input
            id="motivo_especifico"
            name="motivo_especifico"
            defaultValue={v("motivo_especifico", reuniao?.motivo_especifico)}
            placeholder="Preencher nas extraordinárias"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="assuntos">Assuntos tratados</Label>
          <textarea
            id="assuntos"
            name="assuntos"
            rows={4}
            defaultValue={v("assuntos", reuniao?.assuntos)}
            className={AREA}
            placeholder="Pauta e deliberações"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="observacoes">Observações</Label>
          <textarea
            id="observacoes"
            name="observacoes"
            rows={2}
            defaultValue={v("observacoes", reuniao?.observacoes)}
            className={AREA}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function RepresentanteForm({
  reuniaoId,
  usuarios,
}: {
  reuniaoId: string
  usuarios: { id: string; nome: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(
    adicionarRepresentanteAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <input type="hidden" name="reuniao_id" value={reuniaoId} />
      <div className="grid gap-1.5">
        <Label htmlFor="usuario_id">Do sistema</Label>
        <select
          id="usuario_id"
          name="usuario_id"
          defaultValue=""
          className={SELECT}
        >
          <option value="">— escolher —</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="nome">Ou digite o nome</Label>
        <Input
          id="nome"
          name="nome"
          placeholder="Para quem não está no sistema"
        />
      </div>
      <div className="flex items-end">
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Adicionar
        </Button>
      </div>
      {estado.erro && (
        <p className="text-destructive text-sm sm:col-span-3">{estado.erro}</p>
      )}
    </form>
  )
}

export function ComparecimentoBotao({
  id,
  reuniaoId,
  compareceu,
}: {
  id: string
  reuniaoId: string
  compareceu: boolean
}) {
  const [, formAction, pendente] = useActionState(comparecimentoAction, {})
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="reuniao_id" value={reuniaoId} />
      <input type="hidden" name="compareceu" value={compareceu ? "0" : "1"} />
      <Button
        type="submit"
        variant={compareceu ? "outline" : "ghost"}
        size="sm"
        disabled={pendente}
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : compareceu ? (
          <X />
        ) : (
          <Check />
        )}
        {compareceu ? "Desfazer" : "Compareceu"}
      </Button>
    </form>
  )
}

export function RemoverRepresentanteBotao({
  id,
  reuniaoId,
}: {
  id: string
  reuniaoId: string
}) {
  const [, formAction, pendente] = useActionState(removerRepresentanteAction, {})
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="reuniao_id" value={reuniaoId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}

export function AtaForm({ reuniaoId }: { reuniaoId: string }) {
  const [estado, formAction, pendente] = useActionState(enviarAtaAction, {})
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="reuniao_id" value={reuniaoId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          name="ata"
          accept="application/pdf"
          required
          className="max-w-xs"
        />
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          Enviar ata
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
    </form>
  )
}

export function ExcluirReuniaoBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(excluirReuniaoAction, {})
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir
      </Button>
      {estado.erro && (
        <p className="text-destructive mt-1 text-xs">{estado.erro}</p>
      )}
    </form>
  )
}
