"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { mascaraCep, mascaraTelefone } from "@/lib/mascaras"

import { atualizarMeuCadastro } from "./actions"

export type ContatoFiliado = {
  email_pessoal: string | null
  email_corporativo: string | null
  telefone_1: string | null
  telefone_1_whatsapp: boolean | null
  telefone_2: string | null
  telefone_2_whatsapp: boolean | null
  endereco_cep: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_estado: string | null
}

function aplicarMascara(
  e: React.ChangeEvent<HTMLInputElement>,
  mascara: (v: string) => string
) {
  e.target.value = mascara(e.target.value)
}

export function CadastroForm({ contato }: { contato: ContatoFiliado }) {
  const [estado, formAction, pendente] = useActionState(atualizarMeuCadastro, {})

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contato</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="email_pessoal">Email pessoal</Label>
            <Input
              id="email_pessoal"
              name="email_pessoal"
              type="email"
              defaultValue={contato.email_pessoal ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email_corporativo">Email corporativo</Label>
            <Input
              id="email_corporativo"
              name="email_corporativo"
              type="email"
              defaultValue={contato.email_corporativo ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="telefone_1">Telefone 1</Label>
            <Input
              id="telefone_1"
              name="telefone_1"
              inputMode="tel"
              defaultValue={contato.telefone_1 ? mascaraTelefone(contato.telefone_1) : ""}
              onChange={(e) => aplicarMascara(e, mascaraTelefone)}
            />
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="telefone_1_whatsapp"
                defaultChecked={contato.telefone_1_whatsapp === true}
              />
              É WhatsApp
            </label>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="telefone_2">Telefone 2</Label>
            <Input
              id="telefone_2"
              name="telefone_2"
              inputMode="tel"
              defaultValue={contato.telefone_2 ? mascaraTelefone(contato.telefone_2) : ""}
              onChange={(e) => aplicarMascara(e, mascaraTelefone)}
            />
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="telefone_2_whatsapp"
                defaultChecked={contato.telefone_2_whatsapp === true}
              />
              É WhatsApp
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="endereco_cep">CEP</Label>
            <Input
              id="endereco_cep"
              name="endereco_cep"
              inputMode="numeric"
              defaultValue={contato.endereco_cep ? mascaraCep(contato.endereco_cep) : ""}
              onChange={(e) => aplicarMascara(e, mascaraCep)}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="endereco_logradouro">Logradouro</Label>
            <Input
              id="endereco_logradouro"
              name="endereco_logradouro"
              defaultValue={contato.endereco_logradouro ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="endereco_numero">Número</Label>
            <Input
              id="endereco_numero"
              name="endereco_numero"
              defaultValue={contato.endereco_numero ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="endereco_complemento">Complemento</Label>
            <Input
              id="endereco_complemento"
              name="endereco_complemento"
              defaultValue={contato.endereco_complemento ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="endereco_bairro">Bairro</Label>
            <Input
              id="endereco_bairro"
              name="endereco_bairro"
              defaultValue={contato.endereco_bairro ?? ""}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="endereco_cidade">Cidade</Label>
            <Input
              id="endereco_cidade"
              name="endereco_cidade"
              defaultValue={contato.endereco_cidade ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="endereco_estado">UF</Label>
            <Input
              id="endereco_estado"
              name="endereco_estado"
              maxLength={2}
              defaultValue={contato.endereco_estado ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </form>
  )
}
