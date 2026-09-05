"use client"

import { useActionState, useState } from "react"
import { Loader2, Plus, Save, Trash2, Wrench } from "lucide-react"

import { CartaoEditavel } from "@/components/cartao-editavel"
import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  removerPlano,
  salvarManutencao,
  salvarPlano,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type VeiculoOpcao = { id: string; rotulo: string }
export type PlanoOpcao = { id: string; descricao: string; veiculo_id: string }
export type CompraOpcao = { id: string; rotulo: string }

export type ManutencaoInicial = {
  id: string
  veiculo_id: string
  tipo: string | null
  descricao: string | null
  realizada_em: string | null
  hodometro: number | null
  local_id: string | null
  valor: number | null
  compra_id: string | null
  nota_fiscal_numero: string | null
  garantia_meses: number | null
  garantia_km: number | null
  plano_id: string | null
  observacoes: string | null
}

// ── Registrar / editar manutenção ────────────────────────────────────────────

export function ManutencaoForm({
  veiculos,
  fornecedores,
  planos,
  compras,
  inicial,
  veiculoFixo,
}: {
  veiculos: VeiculoOpcao[]
  fornecedores: EmpresaOpcao[]
  planos: PlanoOpcao[]
  compras: CompraOpcao[]
  inicial?: ManutencaoInicial
  veiculoFixo?: string
}) {
  const [estado, formAction, pendente] = useActionState(salvarManutencao, {})
  const [veiculoId, setVeiculoId] = useState(
    inicial?.veiculo_id ?? veiculoFixo ?? ""
  )
  const [tipo, setTipo] = useState(inicial?.tipo ?? "preventiva")

  // Só as programações do veículo escolhido fazem sentido no seletor.
  const planosDoVeiculo = planos.filter((p) => p.veiculo_id === veiculoId)

  return (
    <form action={formAction} className="grid gap-4">
      {inicial && <input type="hidden" name="id" value={inicial.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="veiculo_id">Veículo</Label>
          {veiculoFixo && !inicial ? (
            <>
              <input type="hidden" name="veiculo_id" value={veiculoFixo} />
              <p className="text-sm">
                {veiculos.find((v) => v.id === veiculoFixo)?.rotulo ?? "—"}
              </p>
            </>
          ) : (
            <select
              id="veiculo_id"
              name="veiculo_id"
              className={SELECT}
              value={veiculoId}
              onChange={(e) => setVeiculoId(e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.rotulo}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="tipo">Tipo</Label>
          <select
            id="tipo"
            name="tipo"
            className={SELECT}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            required
          >
            <option value="preventiva">Preventiva</option>
            <option value="corretiva">Corretiva</option>
          </select>
          <p className="text-muted-foreground text-xs">
            {tipo === "preventiva"
              ? "Programada — evita a quebra."
              : "Conserto — o problema já aconteceu."}
          </p>
        </div>
      </div>

      {tipo === "preventiva" && planosDoVeiculo.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="plano_id">Cumpre qual programação?</Label>
          <select
            id="plano_id"
            name="plano_id"
            className={SELECT}
            defaultValue={inicial?.plano_id ?? ""}
          >
            <option value="">Nenhuma / avulsa</option>
            {planosDoVeiculo.map((p) => (
              <option key={p.id} value={p.id}>
                {p.descricao}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Apontar a programação zera o contador dela — é assim que o próximo
            vencimento é calculado.
          </p>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="descricao">O que foi feito</Label>
        <Textarea
          id="descricao"
          name="descricao"
          rows={3}
          defaultValue={inicial?.descricao ?? ""}
          placeholder="Troca de óleo e filtro, revisão de freios dianteiros, substituição da correia dentada."
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="realizada_em">Data</Label>
          <Input
            id="realizada_em"
            name="realizada_em"
            type="date"
            defaultValue={inicial?.realizada_em ?? ""}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="hodometro">Hodômetro (km)</Label>
          <Input
            id="hodometro"
            name="hodometro"
            type="number"
            min={0}
            defaultValue={inicial?.hodometro ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="valor">Valor (R$)</Label>
          <Input
            id="valor"
            name="valor"
            type="number"
            min={0}
            step="0.01"
            defaultValue={inicial?.valor ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Local (oficina)</Label>
        <EmpresaCombobox
          empresas={fornecedores}
          name="local_id"
          defaultId={inicial?.local_id ?? undefined}
        />
        <p className="text-muted-foreground text-xs">
          A oficina é um fornecedor cadastrado em Compras. Se ela ainda não
          estiver lá, cadastre primeiro em Compras → Fornecedores.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="compra_id">Compra que pagou</Label>
          <select
            id="compra_id"
            name="compra_id"
            className={SELECT}
            defaultValue={inicial?.compra_id ?? ""}
          >
            <option value="">Nenhuma</option>
            {compras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Amarra o gasto ao processo de compra, sem redigitar valores.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="nota_fiscal_numero">Nota fiscal (número)</Label>
          <Input
            id="nota_fiscal_numero"
            name="nota_fiscal_numero"
            defaultValue={inicial?.nota_fiscal_numero ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="nota_fiscal">Arquivo da nota fiscal</Label>
        <Input
          id="nota_fiscal"
          name="nota_fiscal"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
        />
        <p className="text-muted-foreground text-xs">
          PDF ou imagem, até 5 MB.
          {inicial ? " Enviar um novo substitui o anterior." : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="garantia_meses">Garantia (meses)</Label>
          <Input
            id="garantia_meses"
            name="garantia_meses"
            type="number"
            min={0}
            defaultValue={inicial?.garantia_meses ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="garantia_km">Garantia (km)</Label>
          <Input
            id="garantia_km"
            name="garantia_km"
            type="number"
            min={0}
            defaultValue={inicial?.garantia_km ?? ""}
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Contam a partir desta manutenção. É o que permite ao sistema avisar
        quando um serviço volta à oficina ainda dentro da garantia do anterior.
      </p>

      <div className="grid gap-2">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          name="observacoes"
          rows={2}
          defaultValue={inicial?.observacoes ?? ""}
        />
      </div>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Wrench />}
          {inicial ? "Salvar alterações" : "Registrar manutenção"}
        </Button>
      </div>
    </form>
  )
}

// ── Preventivas programadas ──────────────────────────────────────────────────

export type PlanoLinha = {
  id: string
  veiculo_id: string
  descricao: string
  intervalo_dias: number | null
  intervalo_km: number | null
  base_data: string | null
  base_hodometro: number | null
  alerta_dias: number
  alerta_km: number
  ativo: boolean
}

function CamposPlano({
  plano,
  veiculos,
}: {
  plano?: PlanoLinha
  veiculos: VeiculoOpcao[]
}) {
  const k = plano?.id ?? "novo"
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`veic-${k}`}>Veículo</Label>
          <select
            id={`veic-${k}`}
            name="veiculo_id"
            className={SELECT}
            defaultValue={plano?.veiculo_id ?? ""}
            required
          >
            <option value="">Selecione…</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`desc-${k}`}>Manutenção</Label>
          <Input
            id={`desc-${k}`}
            name="descricao"
            defaultValue={plano?.descricao}
            placeholder="Troca de óleo e filtro"
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`idias-${k}`}>A cada quantos dias</Label>
          <Input
            id={`idias-${k}`}
            name="intervalo_dias"
            type="number"
            min={0}
            defaultValue={plano?.intervalo_dias ?? ""}
            placeholder="365"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`ikm-${k}`}>A cada quantos km</Label>
          <Input
            id={`ikm-${k}`}
            name="intervalo_km"
            type="number"
            min={0}
            defaultValue={plano?.intervalo_km ?? ""}
            placeholder="10000"
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Pode preencher só um ou os dois. Com os dois, vale o que vencer
        primeiro — como no manual do fabricante.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`bdata-${k}`}>Última feita em</Label>
          <Input
            id={`bdata-${k}`}
            name="base_data"
            type="date"
            defaultValue={plano?.base_data ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`bkm-${k}`}>Hodômetro na última</Label>
          <Input
            id={`bkm-${k}`}
            name="base_hodometro"
            type="number"
            min={0}
            defaultValue={plano?.base_hodometro ?? ""}
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Ponto de partida do primeiro ciclo. Depois que houver manutenção
        registrada apontando para esta programação, o cálculo passa a usar ela.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`adias-${k}`}>Avisar com (dias)</Label>
          <Input
            id={`adias-${k}`}
            name="alerta_dias"
            type="number"
            min={0}
            defaultValue={plano?.alerta_dias ?? 15}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`akm-${k}`}>Avisar com (km)</Label>
          <Input
            id={`akm-${k}`}
            name="alerta_km"
            type="number"
            min={0}
            defaultValue={plano?.alerta_km ?? 500}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-md border p-3">
        <input
          type="checkbox"
          name="ativo"
          className="mt-0.5 size-4"
          defaultChecked={plano?.ativo ?? true}
        />
        <span className="grid gap-1">
          <span className="text-sm font-medium">Ativa</span>
          <span className="text-muted-foreground text-xs">
            Programações inativas param de gerar alerta, mas não somem do
            histórico.
          </span>
        </span>
      </label>
    </div>
  )
}

export function NovoPlanoForm({ veiculos }: { veiculos: VeiculoOpcao[] }) {
  const [estado, formAction, pendente] = useActionState(salvarPlano, {})
  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <CamposPlano veiculos={veiculos} />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Programar
        </Button>
      </div>
    </form>
  )
}

export function PlanoEditavel({
  plano,
  veiculos,
  veiculoRotulo,
  resumo,
}: {
  plano: PlanoLinha
  veiculos: VeiculoOpcao[]
  veiculoRotulo: string
  resumo: string
}) {
  const [estado, formAction, pendente] = useActionState(salvarPlano, {})
  const [estadoRem, removerAction, removendo] = useActionState(removerPlano, {})

  const intervalo = [
    plano.intervalo_dias ? `${plano.intervalo_dias} dias` : null,
    plano.intervalo_km
      ? `${plano.intervalo_km.toLocaleString("pt-BR")} km`
      : null,
  ]
    .filter(Boolean)
    .join(" ou ")

  return (
    <CartaoEditavel
      titulo={`${plano.descricao} — ${veiculoRotulo}`}
      descricao={plano.ativo ? intervalo : `${intervalo} · inativa`}
      resumo={
        <p className="text-muted-foreground text-xs">
          {resumo}
        </p>
      }
    >
      <div className="grid gap-4">
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        {estado.ok && (
          <Alert>
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
        )}
        {estadoRem.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estadoRem.erro}</AlertDescription>
          </Alert>
        )}

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="id" value={plano.id} />
          <CamposPlano plano={plano} veiculos={veiculos} />
          <div>
            <Button type="submit" size="sm" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          </div>
        </form>

        <form action={removerAction}>
          <input type="hidden" name="id" value={plano.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={removendo}
          >
            {removendo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir programação
          </Button>
        </form>
      </div>
    </CartaoEditavel>
  )
}

// ── Selo de situação ─────────────────────────────────────────────────────────

export function SeloPreventiva({
  vencido,
  proximo,
  dias,
  km,
  motivo,
}: {
  vencido: boolean
  proximo: boolean
  dias: number | null
  km: number | null
  motivo: "data" | "km" | null
}) {
  if (!vencido && !proximo) return <Badge variant="secondary">em dia</Badge>

  const porData = motivo === "data"
  const valor = porData ? dias : km
  if (valor === null) return <Badge variant="secondary">sem referência</Badge>

  const unidade = porData
    ? Math.abs(valor) === 1
      ? "dia"
      : "dias"
    : "km"
  const quantia = porData
    ? Math.abs(valor)
    : Math.abs(valor).toLocaleString("pt-BR")

  return (
    <Badge variant={vencido ? "destructive" : "warning"}>
      {vencido ? `vencida há ${quantia} ${unidade}` : `faltam ${quantia} ${unidade}`}
    </Badge>
  )
}
