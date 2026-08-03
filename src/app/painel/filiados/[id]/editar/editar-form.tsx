"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { FILIACAO_CONDICOES } from "@/lib/filiacao"
import { mascaraCep, mascaraTelefone } from "@/lib/mascaras"

import { atualizarCadastroFiliado } from "./actions"

type Cadastro = Record<string, unknown>

function valor(f: Cadastro, campo: string): string {
  const v = f[campo]
  return typeof v === "string" ? v : ""
}

function CampoTexto({
  f,
  campo,
  rotulo,
  ...props
}: {
  f: Cadastro
  campo: string
  rotulo: string
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={campo}>{rotulo}</Label>
      <Input id={campo} name={campo} defaultValue={valor(f, campo)} {...props} />
    </div>
  )
}

/** Campo com máscara aplicada enquanto digita (o servidor guarda só dígitos). */
function CampoMascarado({
  f,
  campo,
  rotulo,
  mascara,
  ...props
}: {
  f: Cadastro
  campo: string
  rotulo: string
  mascara: (v: string) => string
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={campo}>{rotulo}</Label>
      <Input
        id={campo}
        name={campo}
        defaultValue={mascara(valor(f, campo))}
        onChange={(e) => {
          e.target.value = mascara(e.target.value)
        }}
        inputMode="numeric"
        {...props}
      />
    </div>
  )
}

/**
 * Preenche logradouro/bairro/cidade/UF a partir do CEP (base pública
 * ViaCEP). Sobrescreve os campos — quem digitou um CEP novo espera isso.
 */
async function preencherEnderecoPorCep(bruto: string) {
  const cep = bruto.replace(/\D/g, "")
  if (cep.length !== 8) return
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
    const d = (await r.json()) as {
      erro?: boolean
      logradouro?: string
      bairro?: string
      localidade?: string
      uf?: string
    }
    if (d.erro) return
    const preencher = (id: string, valor?: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null
      if (el && valor) el.value = valor
    }
    preencher("endereco_logradouro", d.logradouro)
    preencher("endereco_bairro", d.bairro)
    preencher("endereco_cidade", d.localidade)
    preencher("endereco_estado", d.uf)
  } catch {
    // sem rede/ViaCEP fora — o preenchimento manual continua valendo
  }
}

export function EditarForm({ filiacao }: { filiacao: Cadastro }) {
  const [estado, formAction, pendente] = useActionState(
    atualizarCadastroFiliado,
    {}
  )

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={String(filiacao.id)} />

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CampoTexto f={filiacao} campo="nome_completo" rotulo="Nome completo" required />
          <CampoTexto f={filiacao} campo="nome_social" rotulo="Nome social" />
          <div className="grid gap-1.5">
            <Label htmlFor="sexo">Sexo</Label>
            <Select
              name="sexo"
              defaultValue={
                typeof filiacao.sexo === "string" ? filiacao.sexo : "nao_informado"
              }
            >
              <SelectTrigger id="sexo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_informado">Não informado</SelectItem>
                <SelectItem value="Masculino">Masculino</SelectItem>
                <SelectItem value="Feminino">Feminino</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nascimento_data">Data de nascimento</Label>
            <Input
              id="nascimento_data"
              name="nascimento_data"
              type="date"
              defaultValue={valor(filiacao, "nascimento_data").slice(0, 10)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="filiacao_condicao">Condição da filiação</Label>
            <Select
              name="filiacao_condicao"
              defaultValue={valor(filiacao, "filiacao_condicao") || "sem_condicao"}
            >
              <SelectTrigger id="filiacao_condicao" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sem_condicao">Sem condição</SelectItem>
                {FILIACAO_CONDICOES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contato</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CampoTexto f={filiacao} campo="email_pessoal" rotulo="Email pessoal" type="email" />
          <CampoTexto f={filiacao} campo="email_corporativo" rotulo="Email corporativo" type="email" />
          <div className="grid gap-1.5">
            <CampoMascarado
              f={filiacao}
              campo="telefone_1"
              rotulo="Telefone 1"
              mascara={mascaraTelefone}
              placeholder="(22) 99999-9999"
            />
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="telefone_1_whatsapp"
                defaultChecked={filiacao.telefone_1_whatsapp === true}
              />
              É WhatsApp
            </label>
          </div>
          <div className="grid gap-1.5">
            <CampoMascarado
              f={filiacao}
              campo="telefone_2"
              rotulo="Telefone 2"
              mascara={mascaraTelefone}
              placeholder="(22) 99999-9999"
            />
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="telefone_2_whatsapp"
                defaultChecked={filiacao.telefone_2_whatsapp === true}
              />
              É WhatsApp
            </label>
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              name="recebe_mensagens"
              defaultChecked={filiacao.recebe_mensagens === true}
            />
            Aceita receber mensagens do sindicato
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CampoMascarado
            f={filiacao}
            campo="endereco_cep"
            rotulo="CEP"
            mascara={mascaraCep}
            placeholder="28.000-000"
            onBlur={(e) => preencherEnderecoPorCep(e.target.value)}
          />
          <CampoTexto
            f={filiacao}
            campo="endereco_logradouro"
            rotulo="Logradouro"
            className="lg:col-span-2"
          />
          <CampoTexto f={filiacao} campo="endereco_numero" rotulo="Número" />
          <CampoTexto f={filiacao} campo="endereco_complemento" rotulo="Complemento" />
          <CampoTexto f={filiacao} campo="endereco_bairro" rotulo="Bairro" />
          <CampoTexto f={filiacao} campo="endereco_cidade" rotulo="Cidade" />
          <CampoTexto f={filiacao} campo="endereco_estado" rotulo="UF" maxLength={2} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href={`/painel/filiados/${filiacao.id}`}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </form>
  )
}
