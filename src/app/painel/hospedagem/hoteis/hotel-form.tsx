"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { OpcaoContrato } from "@/lib/db/contratos"
import {
  DIAS_SEMANA,
  MODALIDADES_CONVENIO,
  REGRAS_DISTRIBUICAO,
  type ModalidadeConvenio,
} from "@/lib/hospedagem-garantida-constantes"

import { atualizarHotel, criarHotel } from "./actions"

export type HotelFormDados = {
  id: string
  nome: string | null
  ativo: boolean | null
  demanda_garantida: boolean | null
  quant_quartos_dedicados: number | null
  max_hospedes_por_quarto: number | null
  max_hospedes_por_dia: number | null
  exige_relatorio_para_faturar?: boolean | null
  contrato_id?: string | null
  modalidade?: string | null
  quartos_por_dia_semana?: (number | null)[] | null
  regra_distribuicao?: string | null
  trava_ultimo_quarto?: boolean | null
  trava_dias_antes?: number | null
  trava_hora?: string | null
  max_noites?: number | null
  horario_checkin?: string | null
  cancelamento_horas?: number | null
  espera_prazo_horas?: number | null
}

function dataBr(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "")
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "sem término"
}

export function HotelForm({
  hotel,
  contratos,
}: {
  hotel?: HotelFormDados
  contratos: OpcaoContrato[]
}) {
  const [estado, formAction, pendente] = useActionState(
    hotel ? atualizarHotel : criarHotel,
    {}
  )
  const [modalidade, setModalidade] = useState<ModalidadeConvenio>(
    hotel?.modalidade === "garantida" ? "garantida" : "uso"
  )

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {hotel && <input type="hidden" name="id" value={hotel.id} />}
      <input type="hidden" name="modalidade_anterior" value={hotel?.modalidade ?? "uso"} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do hotel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" name="nome" defaultValue={hotel?.nome ?? ""} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="quant_quartos_dedicados">Quartos dedicados</Label>
            <Input
              id="quant_quartos_dedicados"
              name="quant_quartos_dedicados"
              type="number"
              min={0}
              defaultValue={hotel?.quant_quartos_dedicados ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="max_hospedes_por_quarto">Máx. hóspedes por quarto</Label>
            <Input
              id="max_hospedes_por_quarto"
              name="max_hospedes_por_quarto"
              type="number"
              min={0}
              defaultValue={hotel?.max_hospedes_por_quarto ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="max_hospedes_por_dia">Máx. hóspedes por dia</Label>
            <Input
              id="max_hospedes_por_dia"
              name="max_hospedes_por_dia"
              type="number"
              min={0}
              defaultValue={hotel?.max_hospedes_por_dia ?? ""}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="contrato_id">Contrato do convênio *</Label>
            <select
              id="contrato_id"
              name="contrato_id"
              required
              defaultValue={hotel?.contrato_id ?? ""}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
            >
              <option value="" disabled>
                Selecione o contrato…
              </option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.codigo, c.objeto].filter(Boolean).join(" — ") ||
                    c.id.slice(0, 8)}
                  {` · vigência até ${dataBr(c.vigenciaTermino)}`}
                  {c.vigente ? "" : " (vencido)"}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              A <strong>vigência</strong> (que limita a retirada de cupons) e o{" "}
              <strong>centro de custo</strong> (usado na ordem do faturamento)
              vêm deste contrato.
              {contratos.length === 0 && (
                <>
                  {" "}
                  Nenhum contrato cadastrado — crie um em Compras → Contratos
                  primeiro.
                </>
              )}
            </p>
          </div>
          <div className="grid content-end gap-2 pb-1 sm:col-span-2">

            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox name="ativo" defaultChecked={hotel ? hotel.ativo !== false : true} />
              Hotel ativo (disponível para novos cupons)
            </label>
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="exige_relatorio_para_faturar"
                defaultChecked={hotel?.exige_relatorio_para_faturar === true}
              />
              Exigir relatório/extrato assinado da reserva para o serviço ser
              faturável
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tipo de convênio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {MODALIDADES_CONVENIO.map((m) => (
              <label key={m.chave} className="flex items-start gap-3 rounded-lg border p-3">
                <input
                  type="radio"
                  name="modalidade"
                  value={m.chave}
                  className="mt-1 size-4"
                  checked={modalidade === m.chave}
                  onChange={() => setModalidade(m.chave)}
                />
                <span className="text-sm">
                  <span className="font-medium">{m.rotulo}</span>
                  <span className="text-muted-foreground block text-xs">{m.descricao}</span>
                </span>
              </label>
            ))}
          </div>

          {modalidade === "garantida" && (
            <div className="grid gap-5 border-t pt-4">
              <div className="grid gap-2">
                <p className="text-sm font-medium">Quartos dedicados por dia da semana</p>
                <p className="text-muted-foreground text-xs">
                  Em branco, vale o número de “Quartos dedicados” acima. As vagas
                  de cada quarto vêm de “Máx. hóspedes por quarto”.
                </p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {DIAS_SEMANA.map((dia, i) => (
                    <div key={dia} className="grid gap-1">
                      <Label htmlFor={`quartos_dia_${i}`} className="text-xs">
                        {dia}
                      </Label>
                      <Input
                        id={`quartos_dia_${i}`}
                        name={`quartos_dia_${i}`}
                        type="number"
                        min={0}
                        max={500}
                        placeholder="padrão"
                        defaultValue={hotel?.quartos_por_dia_semana?.[i] ?? ""}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <p className="text-sm font-medium">Distribuição dos hóspedes</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {REGRAS_DISTRIBUICAO.map((r) => (
                    <label key={r.chave} className="flex items-start gap-3 rounded-lg border p-3">
                      <input
                        type="radio"
                        name="regra_distribuicao"
                        value={r.chave}
                        className="mt-1 size-4"
                        defaultChecked={(hotel?.regra_distribuicao ?? "lotacao") === r.chave}
                      />
                      <span className="text-sm">
                        <span className="font-medium">{r.rotulo}</span>
                        <span className="text-muted-foreground block text-xs">{r.descricao}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  Nas duas regras, cada quarto recebe só pessoas do mesmo sexo e
                  o hóspede fica no mesmo quarto a estadia toda.
                </p>
              </div>

              <div className="grid gap-3 rounded-lg border p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="trava_ultimo_quarto"
                    className="mt-0.5 size-4"
                    defaultChecked={hotel?.trava_ultimo_quarto !== false}
                  />
                  <span className="text-sm">
                    <span className="font-medium">Guardar o último quarto para o outro sexo</span>
                    <span className="text-muted-foreground block text-xs">
                      Quando todos os outros quartos da noite estão com pessoas do
                      mesmo sexo, o último quarto vazio só abre para esse sexo
                      depois do prazo abaixo.
                    </span>
                  </span>
                </label>
                <div className="grid gap-3 pl-7 sm:grid-cols-[11rem_9rem]">
                  <div className="grid gap-1.5">
                    <Label htmlFor="trava_dias_antes">Dias antes da noite</Label>
                    <Input
                      id="trava_dias_antes"
                      name="trava_dias_antes"
                      type="number"
                      min={0}
                      max={60}
                      defaultValue={hotel?.trava_dias_antes ?? 3}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="trava_hora">Até a hora</Label>
                    <Input
                      id="trava_hora"
                      name="trava_hora"
                      type="time"
                      defaultValue={(hotel?.trava_hora ?? "12:00").slice(0, 5)}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="max_noites">Máximo de noites</Label>
                  <Input
                    id="max_noites"
                    name="max_noites"
                    type="number"
                    min={1}
                    max={60}
                    defaultValue={hotel?.max_noites ?? 7}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="horario_checkin">Horário do check-in</Label>
                  <Input
                    id="horario_checkin"
                    name="horario_checkin"
                    type="time"
                    defaultValue={(hotel?.horario_checkin ?? "14:00").slice(0, 5)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cancelamento_horas">Cancelar até (horas antes)</Label>
                  <Input
                    id="cancelamento_horas"
                    name="cancelamento_horas"
                    type="number"
                    min={0}
                    max={720}
                    defaultValue={hotel?.cancelamento_horas ?? 24}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="espera_prazo_horas">Confirmar vaga da espera (horas)</Label>
                  <Input
                    id="espera_prazo_horas"
                    name="espera_prazo_horas"
                    type="number"
                    min={1}
                    max={168}
                    defaultValue={hotel?.espera_prazo_horas ?? 12}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href="/painel/hospedagem/hoteis">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {hotel ? "Salvar alterações" : "Criar hotel"}
        </Button>
      </div>
    </form>
  )
}
