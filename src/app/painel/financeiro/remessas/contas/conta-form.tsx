"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BANCOS } from "@/lib/cnab/bancos"
import type { ContaBancaria } from "@/lib/db/remessas"

import { salvarContaAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function ContaForm({
  conta,
  centros,
  titularPadrao,
}: {
  conta: ContaBancaria | null
  centros: { id: string; nome: string }[]
  titularPadrao: { nome: string | null; documento: string | null }
}) {
  const [estado, action, salvando] = useActionState(salvarContaAction, {})
  return (
    <form action={action} className="grid gap-4">
      {conta && <input type="hidden" name="conta_id" value={conta.id} />}
      <ErroNoCampo estado={estado} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="apelido">Nome da conta *</Label>
          <Input id="apelido" name="apelido" defaultValue={conta?.apelido ?? ""} placeholder="Ex.: BB corrente" required maxLength={60} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="banco_codigo">Banco *</Label>
          <select id="banco_codigo" name="banco_codigo" defaultValue={conta?.bancoCodigo ?? ""} className={SELECT} required>
            <option value="" disabled>
              Escolha…
            </option>
            {BANCOS.map((b) => (
              <option key={b.codigo} value={b.codigo}>
                {b.codigo} — {b.nome}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">Outro banco: escolha o mais próximo e ajuste as versões do layout abaixo com o que o banco informar.</p>
        </div>
        <div className="grid grid-cols-[1fr_4rem] gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="agencia">Agência *</Label>
            <Input id="agencia" name="agencia" defaultValue={conta?.agencia ?? ""} required inputMode="numeric" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="agencia_dv">DV</Label>
            <Input id="agencia_dv" name="agencia_dv" defaultValue={conta?.agenciaDv ?? ""} maxLength={1} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_4rem] gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="conta">Conta *</Label>
            <Input id="conta" name="conta" defaultValue={conta?.conta ?? ""} required inputMode="numeric" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="conta_dv">DV</Label>
            <Input id="conta_dv" name="conta_dv" defaultValue={conta?.contaDv ?? ""} maxLength={1} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tipo_conta">Tipo</Label>
          <select id="tipo_conta" name="tipo_conta" defaultValue={conta?.tipoConta ?? "corrente"} className={SELECT}>
            <option value="corrente">Conta corrente</option>
            <option value="poupanca">Poupança</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="convenio">Convênio de pagamentos</Label>
          <Input id="convenio" name="convenio" defaultValue={conta?.convenio ?? ""} placeholder="Número que o banco deu para a remessa" maxLength={20} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="titular_nome">Titular (nome)</Label>
          <Input id="titular_nome" name="titular_nome" defaultValue={conta?.titularNome ?? ""} placeholder={titularPadrao.nome ?? "Nome da entidade"} maxLength={60} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="titular_documento">Titular (CNPJ)</Label>
          <Input id="titular_documento" name="titular_documento" defaultValue={conta?.titularDocumento ?? ""} placeholder={titularPadrao.documento ?? "CNPJ da entidade"} maxLength={18} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pix_chave">Chave Pix da entidade</Label>
          <Input id="pix_chave" name="pix_chave" defaultValue={conta?.pixChave ?? ""} placeholder="Usada na cobrança da contribuição (dia 3)" maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="centro_custo_id">Centro de custo do débito</Label>
          <select id="centro_custo_id" name="centro_custo_id" defaultValue={conta?.centroCustoId ?? ""} className={SELECT}>
            <option value="">— sem padrão —</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">Gravado na ordem quando o retorno confirma o pagamento.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="versao_arquivo">Versão do layout (arquivo)</Label>
          <Input id="versao_arquivo" name="versao_arquivo" defaultValue={conta?.versaoArquivo ?? ""} placeholder="padrão do banco" maxLength={3} inputMode="numeric" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="versao_lote">Versão do layout (lote)</Label>
          <Input id="versao_lote" name="versao_lote" defaultValue={conta?.versaoLote ?? ""} placeholder="padrão do banco" maxLength={3} inputMode="numeric" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ativa" defaultChecked={conta?.ativa ?? true} className="size-4" />
        Conta ativa (aparece na geração de remessa)
      </label>
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar conta
        </Button>
      </div>
    </form>
  )
}
