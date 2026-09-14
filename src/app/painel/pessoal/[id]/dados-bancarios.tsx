"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { CartaoEditavel } from "@/components/cartao-editavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { rotuloTipoConta, TIPOS_CHAVE_PIX, TIPOS_CONTA } from "@/lib/contracheques-constantes"

import { salvarDadosBancariosAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type DadosBancariosTela = {
  banco: string | null
  bancoCodigo: string | null
  agencia: string | null
  conta: string | null
  tipoConta: string | null
  pix: string | null
  pixTipo: string | null
  favorecido: string | null
  preferePix: boolean
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm break-words">{valor || "—"}</dd>
    </div>
  )
}

/** Conta e Pix do funcionário — destino das ordens de pagamento da folha. */
export function DadosBancariosFuncionario({
  usuarioId,
  dados,
}: {
  usuarioId: string
  dados: DadosBancariosTela | null
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarDadosBancariosAction,
    {}
  )

  return (
    <div id="dados-bancarios" className="scroll-mt-20">
      <CartaoEditavel
        titulo="Dados bancários"
        descricao="Onde cai o pagamento das ordens geradas pelos contracheques"
        abertoInicial={!dados}
        resumo={
          dados ? (
            <dl className="grid gap-3 sm:grid-cols-3">
              <Campo
                rotulo="Banco"
                valor={[dados.banco, dados.bancoCodigo ? `(${dados.bancoCodigo})` : null].filter(Boolean).join(" ")}
              />
              <Campo rotulo="Agência" valor={dados.agencia} />
              <Campo
                rotulo="Conta"
                valor={[dados.conta, rotuloTipoConta(dados.tipoConta)].filter(Boolean).join(" · ")}
              />
              <Campo rotulo="Chave Pix" valor={[dados.pixTipo, dados.pix].filter(Boolean).join(": ")} />
              <Campo rotulo="Favorecido" valor={dados.favorecido} />
              <Campo rotulo="Pagar por" valor={dados.preferePix ? "Pix" : "Conta bancária"} />
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">Sem dados bancários.</p>
          )
        }
      >
        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="usuario_id" value={usuarioId} />
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
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="db-banco">Banco</Label>
              <Input id="db-banco" name="banco" defaultValue={dados?.banco ?? ""} placeholder="Banco do Brasil" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="db-banco-codigo">Código</Label>
              <Input
                id="db-banco-codigo"
                name="banco_codigo"
                inputMode="numeric"
                maxLength={3}
                defaultValue={dados?.bancoCodigo ?? ""}
                placeholder="001"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="db-tipo-conta">Tipo de conta</Label>
              <select id="db-tipo-conta" name="tipo_conta" defaultValue={dados?.tipoConta?.toLowerCase() ?? ""} className={SELECT}>
                <option value="">—</option>
                {TIPOS_CONTA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="db-agencia">Agência</Label>
              <Input id="db-agencia" name="agencia" defaultValue={dados?.agencia ?? ""} placeholder="1234-5" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="db-conta">Conta</Label>
              <Input id="db-conta" name="conta" defaultValue={dados?.conta ?? ""} placeholder="12345-6" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="db-favorecido">Favorecido (se não for o próprio)</Label>
              <Input id="db-favorecido" name="favorecido" defaultValue={dados?.favorecido ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="db-pix-tipo">Tipo da chave Pix</Label>
              <select id="db-pix-tipo" name="pix_tipo" defaultValue={dados?.pixTipo ?? ""} className={SELECT}>
                <option value="">—</option>
                {TIPOS_CHAVE_PIX.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 sm:col-span-3">
              <Label htmlFor="db-pix">Chave Pix</Label>
              <Input id="db-pix" name="pix" defaultValue={dados?.pix ?? ""} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="prefere_pix" defaultChecked={dados?.preferePix ?? false} />
            Pagar por Pix (em vez da conta)
          </label>
          <div>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar dados bancários
            </Button>
          </div>
        </form>
      </CartaoEditavel>
    </div>
  )
}
