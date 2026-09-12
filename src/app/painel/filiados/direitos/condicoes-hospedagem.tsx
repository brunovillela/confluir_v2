"use client"

import { useActionState, useState } from "react"
import { Loader2, Save, Trash2, UserPlus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { REGIMES_TRABALHO } from "@/lib/filiacao"
import {
  PERIODOS_QUANTIDADE,
  type CondicoesHospedagem,
} from "@/lib/hospedagem-condicoes-constantes"
import { mascaraCpf } from "@/lib/mascaras"

import {
  incluirBeneficiarioHospedagemAction,
  removerBeneficiarioHospedagemAction,
  salvarCondicoesHospedagemAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type OpcaoFonteCondicao = {
  id: string
  nome: string
  /** "fundo de pensão", "inativa"… */
  detalhe: string | null
}

function Recado({ erro, ok }: { erro?: string; ok?: string }) {
  if (!erro && !ok) return null
  return (
    <Alert variant={erro ? "destructive" : "success"}>
      <AlertDescription className="text-sm">{erro ?? ok}</AlertDescription>
    </Alert>
  )
}

/**
 * Uma condição: caixa de marcação no cabeçalho e os detalhes abaixo. Os
 * detalhes ficam só ESCONDIDOS quando a condição está desligada — continuam
 * no formulário, então desligar e religar não perde o que foi marcado.
 */
function Condicao({
  nome,
  titulo,
  descricao,
  ligada,
  aoMudar,
  children,
}: {
  nome: string
  titulo: string
  descricao: string
  ligada: boolean
  aoMudar: (ligada: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name={nome}
          className="mt-0.5 size-4"
          checked={ligada}
          onChange={(e) => aoMudar(e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-medium">{titulo}</span>
          <span className="text-muted-foreground block text-xs">{descricao}</span>
        </span>
      </label>
      {children && (
        <div hidden={!ligada} className="grid gap-3 pl-7">
          {children}
        </div>
      )}
    </div>
  )
}

export function CondicoesHospedagemForm({
  condicoes,
  fontes,
}: {
  condicoes: CondicoesHospedagem
  /** Fontes pagadoras, em ordem alfabética. */
  fontes: OpcaoFonteCondicao[]
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarCondicoesHospedagemAction,
    {}
  )
  const [porFonte, setPorFonte] = useState(condicoes.restringirFontes)
  const [porQuantidade, setPorQuantidade] = useState(condicoes.limitarQuantidade)
  const [porRegime, setPorRegime] = useState(condicoes.restringirRegimes)
  const [porLista, setPorLista] = useState(condicoes.somenteBeneficiarios)
  const [fontesMarcadas, setFontesMarcadas] = useState(
    () => new Set(condicoes.fontesIds)
  )
  const [filtroFonte, setFiltroFonte] = useState("")

  const filtro = filtroFonte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
  const combina = (nome: string) =>
    !filtro ||
    nome
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .includes(filtro)

  return (
    <form action={formAction} className="grid gap-4">
      <Recado erro={estado.erro} ok={estado.ok} />

      <Condicao
        nome="restringir_fontes"
        titulo="Restringir por fonte pagadora"
        descricao="Só quem tem vínculo em aberto com uma das fontes marcadas."
        ligada={porFonte}
        aoMudar={setPorFonte}
      >
        <Input
          value={filtroFonte}
          onChange={(e) => setFiltroFonte(e.target.value)}
          placeholder="Filtrar fontes pelo nome"
          aria-label="Filtrar fontes"
        />
        <div className="grid max-h-60 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {fontes.map((f) => (
            <label
              key={f.id}
              hidden={!combina(f.nome)}
              className="hover:bg-muted/60 flex items-center gap-2 rounded px-1.5 py-1 text-sm"
            >
              <input
                type="checkbox"
                name="fontes"
                value={f.id}
                className="size-4 shrink-0"
                checked={fontesMarcadas.has(f.id)}
                onChange={(e) => {
                  const proximo = new Set(fontesMarcadas)
                  if (e.target.checked) proximo.add(f.id)
                  else proximo.delete(f.id)
                  setFontesMarcadas(proximo)
                }}
              />
              <span className="min-w-0 truncate">{f.nome}</span>
              {f.detalhe && (
                <span className="text-muted-foreground shrink-0 text-xs">
                  {f.detalhe}
                </span>
              )}
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          {fontesMarcadas.size === 0
            ? "Nenhuma fonte marcada."
            : `${fontesMarcadas.size} fonte(s) marcada(s).`}
        </p>
      </Condicao>

      <Condicao
        nome="restringir_regimes"
        titulo="Restringir por regime de trabalho"
        descricao="Vale o regime registrado no vínculo em aberto. Quem não tem regime registrado, como aposentados, fica de fora."
        ligada={porRegime}
        aoMudar={setPorRegime}
      >
        <div className="grid gap-1 sm:grid-cols-2">
          {REGIMES_TRABALHO.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="regimes"
                value={r}
                className="size-4"
                defaultChecked={condicoes.regimes.includes(r)}
              />
              {r}
            </label>
          ))}
        </div>
        {porFonte && (
          <p className="text-muted-foreground text-xs">
            Com fonte e regime ligados, o mesmo vínculo precisa atender aos dois.
          </p>
        )}
      </Condicao>

      <Condicao
        nome="limitar_quantidade"
        titulo="Limitar a quantidade de cupons"
        descricao="Conta os cupons não cancelados da pessoa com check-in no mesmo mês ou ano do cupom pedido."
        ligada={porQuantidade}
        aoMudar={setPorQuantidade}
      >
        <div className="grid gap-3 sm:grid-cols-[8rem_10rem]">
          <div className="grid gap-1.5">
            <Label htmlFor="quantidade_maxima">Até</Label>
            <Input
              id="quantidade_maxima"
              name="quantidade_maxima"
              type="number"
              min={1}
              max={365}
              defaultValue={condicoes.quantidadeMaxima}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="quantidade_periodo">Cupons</Label>
            <select
              id="quantidade_periodo"
              name="quantidade_periodo"
              className={SELECT}
              defaultValue={condicoes.quantidadePeriodo}
            >
              {PERIODOS_QUANTIDADE.map((p) => (
                <option key={p.chave} value={p.chave}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Condicao>

      <Condicao
        nome="somente_beneficiarios"
        titulo="Somente a lista de beneficiários"
        descricao="Só as pessoas incluídas na lista de beneficiários, logo abaixo, podem solicitar cupom."
        ligada={porLista}
        aoMudar={setPorLista}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="observacao_hospedagem">
          Texto para o associado (opcional)
        </Label>
        <Textarea
          id="observacao_hospedagem"
          name="observacao"
          rows={2}
          defaultValue={condicoes.observacao ?? ""}
          placeholder="Ex.: dúvidas sobre a hospedagem, fale com a secretaria."
        />
        <p className="text-muted-foreground text-xs">
          Aparece no portal do associado, em Hospedagem, junto das regras de
          utilização.
        </p>
      </div>

      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar condições
        </Button>
      </div>
    </form>
  )
}

export function IncluirBeneficiarioHospedagem() {
  const [estado, formAction, pendente] = useActionState(
    incluirBeneficiarioHospedagemAction,
    {}
  )
  const [cpf, setCpf] = useState("")

  return (
    <form action={formAction} className="grid gap-3">
      <Recado erro={estado.erro} ok={estado.ok} />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="cpf-beneficiario">CPF do filiado</Label>
          <Input
            id="cpf-beneficiario"
            name="cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="obs-beneficiario">Observação (opcional)</Label>
          <Input
            id="obs-beneficiario"
            name="observacao"
            placeholder="Ex.: aprovado na reunião de diretoria de 10/09"
          />
        </div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Incluir
        </Button>
      </div>
    </form>
  )
}

export function RemoverBeneficiarioHospedagem({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(
    removerBeneficiarioHospedagemAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Remover
      </Button>
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
    </form>
  )
}
