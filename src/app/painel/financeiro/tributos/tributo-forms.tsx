"use client"

import { useActionState, useEffect, useState } from "react"
import { FilePlus2, Loader2, Pencil, Plus, Save } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CampoArquivo } from "@/components/ui/campo-arquivo"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ACEITA_NOTA, prepararArquivo } from "@/lib/arquivo-envio"
import { ESFERAS_TRIBUTO, PERIODICIDADES_TRIBUTO } from "@/lib/tributos-constantes"

import { lancarGuiaAction, salvarTributoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

type Opcao = { id: string; rotulo: string }

export type TributoForm = {
  id: string
  nome: string
  abreviacao: string | null
  esfera: string
  beneficiarioId: string | null
  centroCustoId: string | null
  departamentoId: string | null
  periodicidade: string
  diaVencimento: number | null
  valorEsperado: number | null
  formaPagamento: string | null
  observacoes: string | null
  ativo: boolean
}

/** Cadastro (novo ou edição) do tributo, num diálogo aberto por um botão. */
export function TributoDialog({
  tributo,
  orgaos,
  centros,
  departamentos,
}: {
  tributo?: TributoForm
  orgaos: EmpresaOpcao[]
  centros: Opcao[]
  departamentos: Opcao[]
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {tributo ? (
          <Button size="sm" variant="outline">
            <Pencil />
            Editar
          </Button>
        ) : (
          <Button size="sm">
            <Plus />
            Novo tributo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tributo ? `Editar ${tributo.abreviacao ?? tributo.nome}` : "Novo tributo"}</DialogTitle>
          <DialogDescription>
            O órgão vira o favorecido das ordens; centro de custo e departamento são herdados por elas.
          </DialogDescription>
        </DialogHeader>
        <TributoCadastro
          key={String(aberto)}
          tributo={tributo}
          orgaos={orgaos}
          centros={centros}
          departamentos={departamentos}
          onSalvo={() => setAberto(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function TributoCadastro({
  tributo,
  orgaos,
  centros,
  departamentos,
  onSalvo,
}: {
  tributo?: TributoForm
  orgaos: EmpresaOpcao[]
  centros: Opcao[]
  departamentos: Opcao[]
  onSalvo: () => void
}) {
  const [estado, acao, pendente] = useActionState(salvarTributoAction, {})
  const [periodicidade, setPeriodicidade] = useState(tributo?.periodicidade ?? "mensal")
  useEffect(() => {
    if (estado.ok) onSalvo()
  }, [estado, onSalvo])
  const valorInicial = tributo?.valorEsperado != null ? tributo.valorEsperado.toFixed(2).replace(".", ",") : ""
  return (
    <form action={acao} className="grid gap-4">
      {tributo && <input type="hidden" name="tributo_id" value={tributo.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="trib_nome">Nome *</Label>
          <Input id="trib_nome" name="nome" required defaultValue={tributo?.nome} placeholder="Ex.: Fundo de Garantia do Tempo de Serviço" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="trib_abrev">Abreviação</Label>
          <Input id="trib_abrev" name="abreviacao" defaultValue={tributo?.abreviacao ?? ""} placeholder="Ex.: FGTS" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="trib_esfera">Esfera *</Label>
          <select id="trib_esfera" name="esfera" defaultValue={tributo?.esfera ?? "federal"} className={SELECT}>
            {ESFERAS_TRIBUTO.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label>Órgão que recebe *</Label>
          <EmpresaCombobox empresas={orgaos} name="beneficiario_id" defaultId={tributo?.beneficiarioId ?? undefined} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="trib_centro">Centro de custo</Label>
          <select id="trib_centro" name="centro_custo_id" defaultValue={tributo?.centroCustoId ?? ""} className={SELECT}>
            <option value="">Não informado</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="trib_depto">Departamento</Label>
          <select id="trib_depto" name="departamento_id" defaultValue={tributo?.departamentoId ?? ""} className={SELECT}>
            <option value="">Não informado</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="trib_per">Periodicidade *</Label>
          <select id="trib_per" name="periodicidade" value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)} className={SELECT}>
            {PERIODICIDADES_TRIBUTO.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="trib_dia">Dia do vencimento{periodicidade === "mensal" ? " *" : ""}</Label>
          <Input
            id="trib_dia"
            name="dia_vencimento"
            type="number"
            min={1}
            max={31}
            required={periodicidade === "mensal"}
            disabled={periodicidade !== "mensal"}
            defaultValue={tributo?.diaVencimento ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="trib_valor">Valor esperado</Label>
          <Input id="trib_valor" name="valor_esperado" inputMode="decimal" defaultValue={valorInicial} placeholder="Variável" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="trib_forma">Forma</Label>
          <select id="trib_forma" name="forma_pagamento" defaultValue={tributo?.formaPagamento ?? "Boleto"} className={SELECT}>
            <option value="Boleto">Boleto / código de barras</option>
            <option value="Pix (QR Code)">Pix (QR Code)</option>
          </select>
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        {PERIODICIDADES_TRIBUTO.find((p) => p.valor === periodicidade)?.descricao} Com valor esperado, a guia
        recorrente nesse valor dispensa a autorização; deixe em branco quando o valor varia.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="trib_obs">Observações</Label>
        <textarea id="trib_obs" name="observacoes" rows={2} defaultValue={tributo?.observacoes ?? ""} className={TEXTAREA} />
      </div>
      {tributo && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked={tributo.ativo} onChange={(e) => {
            const h = e.currentTarget.form?.elements.namedItem("ativo") as HTMLInputElement | null
            if (h) h.value = e.currentTarget.checked ? "1" : "0"
          }} />
          Ativo (desativado não prevê guias novas)
          <input type="hidden" name="ativo" defaultValue={tributo.ativo ? "1" : "0"} />
        </label>
      )}
      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Save />}
        {tributo ? "Salvar" : "Cadastrar tributo"}
      </Button>
    </form>
  )
}

/**
 * Lançar a guia de uma competência: anexo, valor, vencimento e linha
 * digitável → ordem de pagamento. Prevista: vem com competência e vencimento
 * preenchidos; avulsa: escolhe-se o mês.
 */
export function LancarGuiaDialog({
  tributoId,
  guia,
  valorEsperado,
}: {
  tributoId: string
  guia?: { id: string; competenciaMes: string; vencimento: string | null; valor: number | null; rotulo: string }
  valorEsperado: number | null
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(lancarGuiaAction, {})
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const valor = guia?.valor ?? valorEsperado
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {guia ? (
          <Button size="sm">
            <FilePlus2 />
            Lançar guia
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <FilePlus2 />
            Guia avulsa
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{guia ? `Lançar a guia de ${guia.rotulo}` : "Lançar guia avulsa"}</DialogTitle>
          <DialogDescription>
            A guia gera a ordem de pagamento (favorecido = órgão do tributo; a própria guia é o boleto e o documento).
          </DialogDescription>
        </DialogHeader>
        <form action={acao} className="grid gap-4">
          <input type="hidden" name="tributo_id" value={tributoId} />
          {guia && <input type="hidden" name="guia_id" value={guia.id} />}
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="guia_comp">Competência *</Label>
              <Input id="guia_comp" name="competencia" type="month" required defaultValue={guia?.competenciaMes ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="guia_valor">Valor *</Label>
              <Input
                id="guia_valor"
                name="valor"
                inputMode="decimal"
                required
                defaultValue={valor != null ? valor.toFixed(2).replace(".", ",") : ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="guia_venc">Vencimento *</Label>
              <Input id="guia_venc" name="vencimento" type="date" required defaultValue={guia?.vencimento ?? ""} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="guia_arquivo">Guia (PDF ou foto) *</Label>
            <CampoArquivo
              id="guia_arquivo"
              name="arquivo"
              required
              accept={ACEITA_NOTA}
              onChange={async (e) => {
                const { erro } = await prepararArquivo(e.currentTarget)
                setErroArquivo(erro ?? null)
              }}
            />
            {erroArquivo && <p className="text-destructive text-xs">{erroArquivo}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="guia_linha">Código de barras / linha digitável</Label>
            <Input id="guia_linha" name="linha_digitavel" inputMode="numeric" placeholder="Para pagar por remessa bancária" />
          </div>
          {valorEsperado != null && (
            <p className="text-muted-foreground text-xs">
              No valor esperado, a ordem já sai &quot;A pagar&quot; (autorização dispensada); em outro valor, vai para a
              alçada.
            </p>
          )}
          <Button type="submit" disabled={pendente} className="justify-self-start">
            {pendente ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
            Lançar e gerar a ordem
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
