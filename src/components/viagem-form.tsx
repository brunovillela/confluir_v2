"use client"

import { startTransition, useActionState, useState } from "react"
import { BedDouble, Loader2, Plane, Plus, Send, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { IconePassagem } from "@/components/viagens"
import { type EstadoForm } from "@/lib/contas"
import type { BeneficiarioViagem, CriterioHorario, ModalPassagem } from "@/lib/viagens-constantes"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Opcao = { id: string; nome: string }
export type PessoaParaViagem = { usuarioId: string; nome: string; departamentoId: string | null }

type ItemRascunho =
  | {
      chave: number
      tipo: "passagem"
      modal: ModalPassagem
      origem: string
      destino: string
      data: string
      saidaCriterio: CriterioHorario
      saidaHora: string
      chegadaCriterio: CriterioHorario
      chegadaHora: string
      bagagemExtra: boolean
      bagagemDescricao: string
      necessidades: string
      observacoes: string
    }
  | {
      chave: number
      tipo: "hospedagem"
      cidade: string
      checkin: string
      checkout: string
      necessidades: string
      observacoes: string
    }

let proximaChave = 1

function novaPassagem(anterior?: ItemRascunho): ItemRascunho {
  // A volta costuma ser o inverso da ida: já sugere origem ↔ destino.
  const ida = anterior?.tipo === "passagem" ? anterior : null
  return {
    chave: proximaChave++,
    tipo: "passagem",
    modal: ida?.modal ?? "aerea",
    origem: ida?.destino ?? "",
    destino: ida?.origem ?? "",
    data: "",
    saidaCriterio: "depois",
    saidaHora: "",
    chegadaCriterio: "ate",
    chegadaHora: "",
    bagagemExtra: false,
    bagagemDescricao: "",
    necessidades: "",
    observacoes: "",
  }
}

function novaHospedagem(itens: ItemRascunho[]): ItemRascunho {
  // Sugere a cidade do destino da primeira passagem e as datas de ida e volta.
  const passagens = itens.filter((i) => i.tipo === "passagem")
  const ida = passagens[0]
  const volta = passagens.length > 1 ? passagens[passagens.length - 1] : undefined
  return {
    chave: proximaChave++,
    tipo: "hospedagem",
    // "Brasília (BSB)" → "Brasília": o código do aeroporto não é cidade.
    cidade: ida?.tipo === "passagem" ? ida.destino.replace(/\s*\([^)]*\)\s*$/, "") : "",
    checkin: ida?.tipo === "passagem" ? ida.data : "",
    checkout: volta?.tipo === "passagem" ? volta.data : "",
    necessidades: "",
    observacoes: "",
  }
}

/**
 * Pedido de viagem: a pessoa (ou a gestão por ela) descreve os trechos de
 * passagem e as estadias. Fica FECHADO até clicarem no botão, como os outros
 * pedidos do painel. Com `pessoas`, é o modo da gestão: escolhe quem viaja,
 * inclusive convidado sem conta.
 */
export function ViagemForm({
  acao,
  departamentos,
  departamentoPadrao,
  eventos,
  pessoas,
  abertoInicial = false,
  rotulo = "Solicitar viagem",
}: {
  acao: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  departamentos: Opcao[]
  departamentoPadrao: string | null
  eventos: Opcao[]
  /** Modo gestão: diretores e funcionários que podem ser escolhidos. */
  pessoas?: { diretores: PessoaParaViagem[]; funcionarios: PessoaParaViagem[] }
  abertoInicial?: boolean
  rotulo?: string
}) {
  const [aberto, setAberto] = useState(abertoInicial)
  const [estado, formAction, pendente] = useActionState(acao, {})
  const [itens, setItens] = useState<ItemRascunho[]>(() => [novaPassagem()])
  const [beneficiario, setBeneficiario] = useState<BeneficiarioViagem>("diretor")
  const [pessoaId, setPessoaId] = useState("")
  const [departamentoId, setDepartamentoId] = useState(departamentoPadrao ?? "")

  if (!aberto) {
    return (
      <div className="flex justify-end">
        <Button onClick={() => setAberto(true)}>
          <Plus />
          {rotulo}
        </Button>
      </div>
    )
  }

  const atualizar = (chave: number, campos: Partial<ItemRascunho>) =>
    setItens((lista) =>
      lista.map((i) => (i.chave === chave ? ({ ...i, ...campos } as ItemRascunho) : i))
    )
  const remover = (chave: number) => setItens((lista) => lista.filter((i) => i.chave !== chave))

  const listaPessoas =
    beneficiario === "diretor"
      ? (pessoas?.diretores ?? [])
      : beneficiario === "funcionario"
        ? (pessoas?.funcionarios ?? [])
        : []

  // A `chave` só serve ao React; o servidor ignora campos que não conhece.
  const itensJson = JSON.stringify(itens)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{rotulo}</CardTitle>
        <CardDescription>
          Descreva os trechos e as estadias. A equipe de viagens cota com as agências e avisa
          por e-mail quando estiver tudo reservado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          // Pelo onSubmit, e não por `action`: o React 19 limpa o formulário
          // depois de uma action, e um erro de validação apagaria o motivo e
          // os selects enquanto os itens (em estado) continuam.
          onSubmit={(e) => {
            e.preventDefault()
            const dados = new FormData(e.currentTarget)
            startTransition(() => formAction(dados))
          }}
          className="grid gap-6"
        >
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="itens" value={itensJson} />

          {pessoas && (
            <fieldset className="grid gap-4">
              <legend className="mb-2 text-sm font-semibold">Quem vai viajar</legend>
              <input type="hidden" name="beneficiario_tipo" value={beneficiario} />
              <div className="flex flex-wrap gap-2">
                {(["diretor", "funcionario", "convidado"] as const).map((b) => (
                  <Button
                    key={b}
                    type="button"
                    size="sm"
                    variant={beneficiario === b ? "default" : "outline"}
                    onClick={() => {
                      setBeneficiario(b)
                      setPessoaId("")
                    }}
                  >
                    {b === "diretor" ? "Diretor(a)" : b === "funcionario" ? "Funcionário(a)" : "Convidado(a)"}
                  </Button>
                ))}
              </div>

              {beneficiario === "convidado" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="convidado_nome">Nome completo (como no documento) *</Label>
                    <Input id="convidado_nome" name="convidado_nome" required />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="convidado_cpf">CPF</Label>
                    <Input id="convidado_cpf" name="convidado_cpf" inputMode="numeric" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="convidado_nascimento">Data de nascimento</Label>
                    <Input id="convidado_nascimento" name="convidado_nascimento" type="date" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="convidado_email">E-mail *</Label>
                    <Input id="convidado_email" name="convidado_email" type="email" required />
                    <p className="text-muted-foreground text-xs">
                      Recebe o aviso com as reservas.
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="convidado_telefone">Telefone</Label>
                    <Input id="convidado_telefone" name="convidado_telefone" type="tel" />
                  </div>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="beneficiario_usuario_id">
                    {beneficiario === "diretor" ? "Diretor(a) *" : "Funcionário(a) *"}
                  </Label>
                  <select
                    id="beneficiario_usuario_id"
                    name="beneficiario_usuario_id"
                    required
                    className={SELECT}
                    value={pessoaId}
                    onChange={(e) => {
                      setPessoaId(e.target.value)
                      const escolhida = listaPessoas.find((p) => p.usuarioId === e.target.value)
                      if (escolhida?.departamentoId) setDepartamentoId(escolhida.departamentoId)
                    }}
                  >
                    <option value="">Escolha…</option>
                    {listaPessoas.map((p) => (
                      <option key={p.usuarioId} value={p.usuarioId}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  {listaPessoas.length === 0 && (
                    <p className="text-muted-foreground text-xs">
                      Ninguém disponível neste quadro.
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="motivo">Motivo da viagem *</Label>
              <Textarea
                id="motivo"
                name="motivo"
                rows={2}
                required
                placeholder="Ex.: reunião da federação em Brasília"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="departamento_id">Departamento que banca</Label>
              <select
                id="departamento_id"
                name="departamento_id"
                className={SELECT}
                value={departamentoId}
                onChange={(e) => setDepartamentoId(e.target.value)}
              >
                <option value="">Não sei / a equipe define</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="evento_id">Evento</Label>
              <select id="evento_id" name="evento_id" className={SELECT} defaultValue="">
                <option value="">Nenhum</option>
                {eventos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4">
            {itens.map((item, indice) =>
              item.tipo === "passagem" ? (
                <fieldset key={item.chave} className="grid gap-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <legend className="flex items-center gap-2 text-sm font-semibold">
                      <IconePassagem modal={item.modal} className="text-muted-foreground size-4" />
                      Item {indice + 1} — passagem
                    </legend>
                    {itens.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-7 px-2"
                        onClick={() => remover(item.chave)}
                      >
                        <Trash2 />
                        Remover
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="grid gap-1.5">
                      <Label>Tipo *</Label>
                      <select
                        className={SELECT}
                        value={item.modal}
                        onChange={(e) =>
                          atualizar(item.chave, { modal: e.target.value as ModalPassagem })
                        }
                      >
                        <option value="aerea">Aérea</option>
                        <option value="rodoviaria">Rodoviária</option>
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Origem *</Label>
                      <Input
                        value={item.origem}
                        placeholder="Cidade ou aeroporto"
                        onChange={(e) => atualizar(item.chave, { origem: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Destino *</Label>
                      <Input
                        value={item.destino}
                        placeholder="Cidade ou aeroporto"
                        onChange={(e) => atualizar(item.chave, { destino: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Data *</Label>
                      <Input
                        type="date"
                        value={item.data}
                        onChange={(e) => atualizar(item.chave, { data: e.target.value })}
                      />
                    </div>
                    <HorarioCampo
                      rotulo="Saída"
                      criterio={item.saidaCriterio}
                      hora={item.saidaHora}
                      onCriterio={(v) => atualizar(item.chave, { saidaCriterio: v })}
                      onHora={(v) => atualizar(item.chave, { saidaHora: v })}
                    />
                    <HorarioCampo
                      rotulo="Chegada"
                      criterio={item.chegadaCriterio}
                      hora={item.chegadaHora}
                      onCriterio={(v) => atualizar(item.chave, { chegadaCriterio: v })}
                      onHora={(v) => atualizar(item.chave, { chegadaHora: v })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={item.bagagemExtra}
                        onChange={(e) =>
                          atualizar(item.chave, { bagagemExtra: e.target.checked })
                        }
                      />
                      Precisa de bagagem extra
                    </label>
                    {item.bagagemExtra && (
                      <Input
                        value={item.bagagemDescricao}
                        placeholder="Ex.: 1 mala de 23 kg despachada"
                        onChange={(e) =>
                          atualizar(item.chave, { bagagemDescricao: e.target.value })
                        }
                      />
                    )}
                  </div>
                  <CamposComuns
                    necessidades={item.necessidades}
                    observacoes={item.observacoes}
                    onNecessidades={(v) => atualizar(item.chave, { necessidades: v })}
                    onObservacoes={(v) => atualizar(item.chave, { observacoes: v })}
                  />
                </fieldset>
              ) : (
                <fieldset key={item.chave} className="grid gap-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <legend className="flex items-center gap-2 text-sm font-semibold">
                      <BedDouble className="text-muted-foreground size-4" />
                      Item {indice + 1} — hospedagem
                    </legend>
                    {itens.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-7 px-2"
                        onClick={() => remover(item.chave)}
                      >
                        <Trash2 />
                        Remover
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="grid gap-1.5">
                      <Label>Cidade *</Label>
                      <Input
                        value={item.cidade}
                        onChange={(e) => atualizar(item.chave, { cidade: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Check-in *</Label>
                      <Input
                        type="date"
                        value={item.checkin}
                        onChange={(e) => atualizar(item.chave, { checkin: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Check-out *</Label>
                      <Input
                        type="date"
                        value={item.checkout}
                        min={item.checkin || undefined}
                        onChange={(e) => atualizar(item.chave, { checkout: e.target.value })}
                      />
                    </div>
                  </div>
                  <CamposComuns
                    necessidades={item.necessidades}
                    observacoes={item.observacoes}
                    onNecessidades={(v) => atualizar(item.chave, { necessidades: v })}
                    onObservacoes={(v) => atualizar(item.chave, { observacoes: v })}
                  />
                </fieldset>
              )
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItens((l) => [...l, novaPassagem(l[l.length - 1])])}
              >
                <Plane />
                Acrescentar passagem
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItens((l) => [...l, novaHospedagem(l)])}
              >
                <BedDouble />
                Acrescentar hospedagem
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Fechar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Send />}
              Enviar solicitação
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function HorarioCampo({
  rotulo,
  criterio,
  hora,
  onCriterio,
  onHora,
}: {
  rotulo: string
  criterio: CriterioHorario
  hora: string
  onCriterio: (v: CriterioHorario) => void
  onHora: (v: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{rotulo}</Label>
      <div className="flex gap-2">
        <select
          aria-label={`${rotulo}: até ou a partir de`}
          className={`${SELECT} w-auto`}
          value={criterio}
          onChange={(e) => onCriterio(e.target.value as CriterioHorario)}
        >
          <option value="ate">até</option>
          <option value="depois">a partir de</option>
        </select>
        <Input
          type="time"
          aria-label={`${rotulo}: horário`}
          value={hora}
          onChange={(e) => onHora(e.target.value)}
        />
      </div>
    </div>
  )
}

function CamposComuns({
  necessidades,
  observacoes,
  onNecessidades,
  onObservacoes,
}: {
  necessidades: string
  observacoes: string
  onNecessidades: (v: string) => void
  onObservacoes: (v: string) => void
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label>Necessidades especiais</Label>
        <Textarea
          rows={2}
          value={necessidades}
          placeholder="Ex.: cadeira de rodas no embarque, quarto acessível"
          onChange={(e) => onNecessidades(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Observações importantes</Label>
        <Textarea
          rows={2}
          value={observacoes}
          placeholder="Ex.: preferência por voo direto, perto do local do evento"
          onChange={(e) => onObservacoes(e.target.value)}
        />
      </div>
    </div>
  )
}
