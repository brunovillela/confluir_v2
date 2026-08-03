"use client"

import { useActionState, useState } from "react"
import { Loader2, Save } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { FichaDiretor } from "@/lib/db/diretoria"

import { salvarFichaAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const CAMISAS = ["PP", "P", "M", "G", "GG", "XG", "XGG"]
const SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
const CHAVES_PIX = ["CPF", "CNPJ", "E-mail", "Telefone", "Aleatória"]

function Campo({
  id,
  rotulo,
  children,
  largo,
}: {
  id: string
  rotulo: string
  children: React.ReactNode
  largo?: boolean
}) {
  return (
    <div className={`grid gap-1.5 ${largo ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  )
}

export function FichaDiretorForm({
  integranteId,
  mandatoId,
  ficha,
  empresas,
}: {
  integranteId: string
  mandatoId: string
  ficha: FichaDiretor | null
  empresas: EmpresaOpcao[]
}) {
  const [estado, formAction, pendente] = useActionState(salvarFichaAction, {})
  const [temRestricao, setTemRestricao] = useState(ficha?.tem_restricao ?? false)
  const v = (k: keyof FichaDiretor) => (ficha?.[k] as string | null) ?? ""

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="integrante_id" value={integranteId} />
      <input type="hidden" name="mandato_id" value={mandatoId} />

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="data_nascimento" rotulo="Data de nascimento">
            <input
              id="data_nascimento"
              name="data_nascimento"
              type="date"
              defaultValue={v("data_nascimento")}
              className={SELECT}
            />
          </Campo>
          <Campo id="email_particular" rotulo="E-mail particular">
            <Input id="email_particular" name="email_particular" type="email" defaultValue={v("email_particular")} />
          </Campo>
          <div className="grid gap-1.5">
            <Label htmlFor="telefone_particular">Telefone particular</Label>
            <Input id="telefone_particular" name="telefone_particular" inputMode="tel" defaultValue={v("telefone_particular")} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="telefone_whatsapp" defaultChecked={ficha?.telefone_whatsapp ?? false} className="size-4" />
              É WhatsApp
            </label>
          </div>
          <Campo id="tamanho_camisa" rotulo="Tamanho de camisa">
            <select id="tamanho_camisa" name="tamanho_camisa" className={SELECT} defaultValue={v("tamanho_camisa")}>
              <option value="">—</option>
              {CAMISAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Campo>
          <Campo id="tipo_sanguineo" rotulo="Tipo sanguíneo">
            <select id="tipo_sanguineo" name="tipo_sanguineo" className={SELECT} defaultValue={v("tipo_sanguineo")}>
              <option value="">—</option>
              {SANGUINEOS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="cep" rotulo="CEP">
            <Input id="cep" name="cep" inputMode="numeric" defaultValue={v("cep")} />
          </Campo>
          <Campo id="logradouro" rotulo="Logradouro" largo>
            <Input id="logradouro" name="logradouro" defaultValue={v("logradouro")} />
          </Campo>
          <Campo id="numero" rotulo="Número">
            <Input id="numero" name="numero" defaultValue={v("numero")} />
          </Campo>
          <Campo id="complemento" rotulo="Complemento">
            <Input id="complemento" name="complemento" defaultValue={v("complemento")} />
          </Campo>
          <Campo id="bairro" rotulo="Bairro">
            <Input id="bairro" name="bairro" defaultValue={v("bairro")} />
          </Campo>
          <Campo id="cidade" rotulo="Cidade">
            <Input id="cidade" name="cidade" defaultValue={v("cidade")} />
          </Campo>
          <Campo id="estado" rotulo="Estado (UF)">
            <Input id="estado" name="estado" maxLength={2} defaultValue={v("estado")} />
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vínculo empregatício</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="tipo_vinculo" rotulo="Tipo de vínculo">
            <Input id="tipo_vinculo" name="tipo_vinculo" defaultValue={v("tipo_vinculo")} placeholder="CLT, estatutário…" />
          </Campo>
          <div className="grid gap-1.5">
            <Label>Empregador ou fundo de pensão</Label>
            <EmpresaCombobox
              empresas={empresas}
              name="empregador_id"
              defaultId={ficha?.empregador_id ?? undefined}
            />
          </div>
          <Campo id="matricula_empregador" rotulo="Matrícula no empregador">
            <Input id="matricula_empregador" name="matricula_empregador" defaultValue={v("matricula_empregador")} />
          </Campo>
          <Campo id="base_operacional" rotulo="Base operacional (sede)">
            <Input id="base_operacional" name="base_operacional" defaultValue={v("base_operacional")} />
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados bancários</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="banco" rotulo="Banco">
            <Input id="banco" name="banco" defaultValue={v("banco")} />
          </Campo>
          <Campo id="agencia" rotulo="Agência">
            <Input id="agencia" name="agencia" defaultValue={v("agencia")} />
          </Campo>
          <Campo id="conta_corrente" rotulo="Conta corrente">
            <Input id="conta_corrente" name="conta_corrente" defaultValue={v("conta_corrente")} />
          </Campo>
          <Campo id="pix" rotulo="Pix">
            <Input id="pix" name="pix" defaultValue={v("pix")} />
          </Campo>
          <Campo id="tipo_chave_pix" rotulo="Tipo de chave Pix">
            <select id="tipo_chave_pix" name="tipo_chave_pix" className={SELECT} defaultValue={v("tipo_chave_pix")}>
              <option value="">—</option>
              {CHAVES_PIX.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acessibilidade e emergência</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="tem_restricao"
              checked={temRestricao}
              onChange={(e) => setTemRestricao(e.target.checked)}
              className="size-4"
            />
            Possui restrição sensorial ou física?
          </label>
          {temRestricao && (
            <Campo id="restricao_descricao" rotulo="Qual(is) restrição(ões)?">
              <Textarea id="restricao_descricao" name="restricao_descricao" rows={2} defaultValue={v("restricao_descricao")} />
            </Campo>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="contato_emergencia" rotulo="Contato de emergência">
              <Input id="contato_emergencia" name="contato_emergencia" defaultValue={v("contato_emergencia")} />
            </Campo>
            <Campo id="telefone_emergencia" rotulo="Telefone do contato de emergência">
              <Input id="telefone_emergencia" name="telefone_emergencia" inputMode="tel" defaultValue={v("telefone_emergencia")} />
            </Campo>
          </div>
        </CardContent>
      </Card>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar ficha
        </Button>
      </div>
    </form>
  )
}
