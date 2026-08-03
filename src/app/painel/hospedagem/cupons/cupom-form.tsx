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

import { FiliadoPicker } from "@/components/filiado-picker"

import { criarCupom } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type HotelOpcao = { id: string; nome: string | null }

export function CupomForm({ hoteis }: { hoteis: HotelOpcao[] }) {
  const [estado, formAction, pendente] = useActionState(criarCupom, {})

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filiado</CardTitle>
        </CardHeader>
        <CardContent>
          <FiliadoPicker endpoint="/painel/hospedagem/cupons/busca-filiado" />
          <p className="text-muted-foreground mt-2 text-xs">
            O subsídio é para filiados com condição “Ativo”.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do cupom</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="hotel_id">Hotel *</Label>
            <select id="hotel_id" name="hotel_id" required className={SELECT} defaultValue="">
              <option value="" disabled>
                Selecione o hotel
              </option>
              {hoteis.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nome ?? "(sem nome)"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="check_in">Check-in previsto *</Label>
            <Input id="check_in" name="check_in" type="date" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sexo">Sexo (para composição dos quartos)</Label>
            <select id="sexo" name="sexo" className={SELECT} defaultValue="">
              <option value="">Não informado</option>
              <option value="Masculino">Masculino</option>
              <option value="Feminino">Feminino</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <div className="grid content-end pb-1">
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox name="aceita_quarto_coletivo" />
              Aceita quarto coletivo
            </label>
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        A retirada do cupom não garante a reserva nem o serviço — a reserva é
        efetivada depois, quando o cupom é vinculado a um serviço de hospedagem.
      </p>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href="/painel/hospedagem/cupons">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Emitir cupom
        </Button>
      </div>
    </form>
  )
}
