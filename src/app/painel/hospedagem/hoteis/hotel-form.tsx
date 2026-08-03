"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
  acordo_vigencia_inicio?: string | null
  acordo_vigencia_fim?: string | null
}

export function HotelForm({ hotel }: { hotel?: HotelFormDados }) {
  const [estado, formAction, pendente] = useActionState(
    hotel ? atualizarHotel : criarHotel,
    {}
  )

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {hotel && <input type="hidden" name="id" value={hotel.id} />}

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
          <div className="grid gap-1.5">
            <Label htmlFor="acordo_vigencia_inicio">Vigência do acordo — início</Label>
            <Input
              id="acordo_vigencia_inicio"
              name="acordo_vigencia_inicio"
              type="date"
              defaultValue={hotel?.acordo_vigencia_inicio ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="acordo_vigencia_fim">Vigência do acordo — fim</Label>
            <Input
              id="acordo_vigencia_fim"
              name="acordo_vigencia_fim"
              type="date"
              defaultValue={hotel?.acordo_vigencia_fim ?? ""}
            />
          </div>
          <div className="grid content-end gap-2 pb-1 sm:col-span-2">
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="demanda_garantida"
                defaultChecked={hotel?.demanda_garantida === true}
              />
              Demanda garantida (o sindicato garante ocupação mínima)
            </label>
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
