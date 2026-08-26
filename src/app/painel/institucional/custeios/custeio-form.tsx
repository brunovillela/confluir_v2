"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  CADENCIAS,
  PERIODICIDADES,
  TIPOS_BENEFICIARIO,
  type Cadencia,
  type TipoBeneficiario,
} from "@/lib/custeio-constantes"

import { atualizarCusteioAction, criarCusteioAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Opcao = { id: string; nome: string; detalhe?: string | null }

type FinalidadeOpcao = {
  id: string
  nome: string
  tipo_beneficiario_sugerido: string
}

export type CusteioInicial = {
  id: string
  finalidade_id: string | null
  tipo_beneficiario: string
  diretoria_integrante_id: string | null
  filiacao_id: string | null
  convidado_id: string | null
  beneficiario_nome: string | null
  descricao: string | null
  evento: string | null
  centro_custo_despesa_id: string | null
  cadencia: string
  valor_parcela: number | null
  num_parcelas: number | null
  periodicidade: string | null
  primeiro_vencimento: string | null
  forma_pagamento: string | null
}

export function CusteioForm({
  custeio,
  finalidades,
  centrosCusto,
  diretores,
  convidados,
  aoCancelarHref,
}: {
  custeio?: CusteioInicial
  finalidades: FinalidadeOpcao[]
  centrosCusto: Opcao[]
  diretores: Opcao[]
  convidados: Opcao[]
  aoCancelarHref: string
}) {
  const [estado, formAction, pendente] = useActionState(
    custeio ? atualizarCusteioAction : criarCusteioAction,
    {}
  )

  const idBeneficiarioInicial =
    custeio?.diretoria_integrante_id ??
    custeio?.filiacao_id ??
    custeio?.convidado_id ??
    ""

  const [finalidadeId, setFinalidadeId] = useState(custeio?.finalidade_id ?? "")
  const [tipo, setTipo] = useState<TipoBeneficiario>(
    (custeio?.tipo_beneficiario as TipoBeneficiario) ?? "diretor"
  )
  const [beneficiarioId, setBeneficiarioId] = useState(idBeneficiarioInicial)
  const [beneficiarioNome, setBeneficiarioNome] = useState(
    custeio?.beneficiario_nome ?? ""
  )
  const [cadencia, setCadencia] = useState<Cadencia>(
    (custeio?.cadencia as Cadencia) ?? "pontual"
  )

  // Ao escolher a finalidade, sugere o tipo de beneficiário (se não for livre).
  const finalidadeSel = useMemo(
    () => finalidades.find((f) => f.id === finalidadeId),
    [finalidades, finalidadeId]
  )
  function aoTrocarFinalidade(id: string) {
    setFinalidadeId(id)
    const f = finalidades.find((x) => x.id === id)
    const sug = f?.tipo_beneficiario_sugerido
    if (sug && sug !== "livre" && sug !== tipo) {
      setTipo(sug as TipoBeneficiario)
      setBeneficiarioId("")
      setBeneficiarioNome("")
    }
  }

  return (
    <form action={formAction} className="grid gap-5">
      {custeio && <input type="hidden" name="custeio_id" value={custeio.id} />}
      <input type="hidden" name="tipo_beneficiario" value={tipo} />
      <input type="hidden" name="beneficiario_id" value={beneficiarioId} />

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="finalidade_id">Finalidade</Label>
          <select
            id="finalidade_id"
            name="finalidade_id"
            className={SELECT}
            value={finalidadeId}
            onChange={(e) => aoTrocarFinalidade(e.target.value)}
          >
            <option value="">Escolha a finalidade…</option>
            {finalidades.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
          {finalidadeSel && (
            <p className="text-muted-foreground text-xs">
              Centro de custo padrão desta finalidade é aplicado
              automaticamente, salvo se você escolher outro abaixo.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label>Tipo de beneficiário</Label>
          <div className="flex flex-wrap gap-3 pt-1.5">
            {TIPOS_BENEFICIARIO.map((t) => (
              <label key={t.chave} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="tipo_radio"
                  checked={tipo === t.chave}
                  onChange={() => {
                    setTipo(t.chave)
                    setBeneficiarioId("")
                    setBeneficiarioNome("")
                  }}
                />
                {t.rotulo}
              </label>
            ))}
          </div>
        </div>
      </div>

      <SeletorBeneficiario
        tipo={tipo}
        diretores={diretores}
        convidados={convidados}
        beneficiarioId={beneficiarioId}
        beneficiarioNome={beneficiarioNome}
        onSelecionar={(id, nome) => {
          setBeneficiarioId(id)
          setBeneficiarioNome(nome)
        }}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Descrição / motivo</Label>
        <Textarea
          id="descricao"
          name="descricao"
          rows={2}
          placeholder="Ex.: diárias e passagens para o congresso da categoria."
          defaultValue={custeio?.descricao ?? ""}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="evento">Evento (opcional)</Label>
          <Input
            id="evento"
            name="evento"
            defaultValue={custeio?.evento ?? ""}
            placeholder="Nome do evento, quando aplicável"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="centro_custo_despesa_id">
            Centro de custo (opcional — padrão da finalidade)
          </Label>
          <select
            id="centro_custo_despesa_id"
            name="centro_custo_despesa_id"
            className={SELECT}
            defaultValue={custeio?.centro_custo_despesa_id ?? ""}
          >
            <option value="">Usar o padrão da finalidade</option>
            {centrosCusto.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="border-border grid gap-4 rounded-md border p-4">
        <legend className="text-muted-foreground px-1 text-xs">
          Valor e cadência
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="valor_parcela">Valor da parcela (R$)</Label>
            <Input
              id="valor_parcela"
              name="valor_parcela"
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={
                custeio?.valor_parcela != null
                  ? String(custeio.valor_parcela).replace(".", ",")
                  : ""
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Cadência</Label>
            <div className="flex flex-wrap gap-3 pt-1.5">
              {CADENCIAS.map((c) => (
                <label
                  key={c.chave}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <input
                    type="radio"
                    name="cadencia"
                    value={c.chave}
                    checked={cadencia === c.chave}
                    onChange={() => setCadencia(c.chave)}
                  />
                  {c.rotulo}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="primeiro_vencimento">
              {cadencia === "recorrente"
                ? "1º vencimento"
                : "Vencimento (opcional)"}
            </Label>
            <input
              id="primeiro_vencimento"
              name="primeiro_vencimento"
              type="date"
              className={DATA}
              defaultValue={custeio?.primeiro_vencimento?.slice(0, 10) ?? ""}
            />
          </div>
        </div>

        {cadencia === "recorrente" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="periodicidade">Periodicidade</Label>
              <select
                id="periodicidade"
                name="periodicidade"
                className={SELECT}
                defaultValue={custeio?.periodicidade ?? "mensal"}
              >
                {PERIODICIDADES.filter((p) => p.chave !== "unica").map((p) => (
                  <option key={p.chave} value={p.chave}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="num_parcelas">Nº de parcelas</Label>
              <Input
                id="num_parcelas"
                name="num_parcelas"
                type="number"
                min={1}
                defaultValue={custeio?.num_parcelas ?? 1}
              />
            </div>
          </div>
        )}

        <div className="grid gap-1.5 sm:max-w-64">
          <Label htmlFor="forma_pagamento">Forma de pagamento (opcional)</Label>
          <Input
            id="forma_pagamento"
            name="forma_pagamento"
            defaultValue={custeio?.forma_pagamento ?? ""}
            placeholder="Ex.: PIX, transferência"
          />
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {custeio ? "Salvar custeio" : "Criar custeio (rascunho)"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}

function SeletorBeneficiario({
  tipo,
  diretores,
  convidados,
  beneficiarioId,
  beneficiarioNome,
  onSelecionar,
}: {
  tipo: TipoBeneficiario
  diretores: Opcao[]
  convidados: Opcao[]
  beneficiarioId: string
  beneficiarioNome: string
  onSelecionar: (id: string, nome: string) => void
}) {
  if (tipo === "diretor" || tipo === "convidado") {
    const opcoes = tipo === "diretor" ? diretores : convidados
    return (
      <div className="grid gap-1.5">
        <Label htmlFor="beneficiario_sel">
          {tipo === "diretor" ? "Diretor" : "Convidado"}
        </Label>
        <select
          id="beneficiario_sel"
          className={SELECT}
          value={beneficiarioId}
          onChange={(e) => {
            const op = opcoes.find((o) => o.id === e.target.value)
            onSelecionar(e.target.value, op?.nome ?? "")
          }}
        >
          <option value="">Escolha…</option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
              {o.detalhe ? ` — ${o.detalhe}` : ""}
            </option>
          ))}
        </select>
        {tipo === "convidado" && (
          <p className="text-muted-foreground text-xs">
            Não está na lista?{" "}
            <Link
              href="/painel/institucional/custeios/convidados/novo"
              className="underline"
            >
              Cadastrar convidado
            </Link>
            .
          </p>
        )}
      </div>
    )
  }

  return (
    <AutocompleteFiliado
      beneficiarioId={beneficiarioId}
      beneficiarioNome={beneficiarioNome}
      onSelecionar={onSelecionar}
    />
  )
}

function AutocompleteFiliado({
  beneficiarioId,
  beneficiarioNome,
  onSelecionar,
}: {
  beneficiarioId: string
  beneficiarioNome: string
  onSelecionar: (id: string, nome: string) => void
}) {
  const [termo, setTermo] = useState(beneficiarioNome)
  const [resultados, setResultados] = useState<Opcao[]>([])
  const [aberto, setAberto] = useState(false)
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    if (beneficiarioId) return // já selecionado
    const t = termo.trim()
    let ativo = true
    const timer = setTimeout(async () => {
      if (t.length < 2) {
        if (ativo) setResultados([])
        return
      }
      setBuscando(true)
      try {
        const resp = await fetch(
          `/painel/institucional/custeios/busca-beneficiario?q=${encodeURIComponent(t)}`
        )
        const dados = (await resp.json()) as { resultados?: Opcao[] }
        if (ativo) {
          setResultados(dados.resultados ?? [])
          setAberto(true)
        }
      } finally {
        if (ativo) setBuscando(false)
      }
    }, 300)
    return () => {
      ativo = false
      clearTimeout(timer)
    }
  }, [termo, beneficiarioId])

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="filiado_busca">Filiado</Label>
      <div className="relative">
        <Input
          id="filiado_busca"
          autoComplete="off"
          value={termo}
          placeholder="Nome ou CPF do filiado"
          onChange={(e) => {
            setTermo(e.target.value)
            if (beneficiarioId) onSelecionar("", "")
          }}
          onFocus={() => resultados.length > 0 && setAberto(true)}
        />
        {buscando && (
          <Loader2 className="text-muted-foreground absolute top-2.5 right-2.5 size-4 animate-spin" />
        )}
        {aberto && resultados.length > 0 && !beneficiarioId && (
          <ul className="border-border bg-background absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border shadow-md">
            {resultados.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="hover:bg-muted w-full px-3 py-1.5 text-left text-sm"
                  onClick={() => {
                    onSelecionar(r.id, r.nome)
                    setTermo(r.nome)
                    setAberto(false)
                  }}
                >
                  {r.nome}
                  {r.detalhe && (
                    <span className="text-muted-foreground">
                      {" "}
                      — {r.detalhe}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {beneficiarioId && (
        <p className="text-success-fg text-xs">Selecionado: {beneficiarioNome}</p>
      )}
    </div>
  )
}
