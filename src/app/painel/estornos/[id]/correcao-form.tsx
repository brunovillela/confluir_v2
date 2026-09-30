"use client";

import { useActionState, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ContaFornecedor,
  PixFornecedor,
} from "@/lib/db/compras-pagamento";

import { DetalhePagamento } from "../../compras/nova/detalhe-pagamento";
import { corrigirEstornoAction } from "./actions";

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]";
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none";

/**
 * Conferir e reencaminhar: a forma de pagamento e o "para onde" (chave ou
 * conta do fornecedor, código Pix, novo boleto), com o que foi conferido.
 */
export function CorrecaoEstornoForm({
  estornoId,
  formas,
  formaAtual,
  fornecedorId,
  buscarMeios,
  hoje,
  vencimentoAtual,
}: {
  estornoId: string;
  hoje: string;
  /** Já formatado para exibição. */
  vencimentoAtual: string | null;
  formas: readonly string[];
  formaAtual: string | null;
  fornecedorId: string | null;
  buscarMeios: (
    fornecedorId: string,
  ) => Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }>;
}) {
  const [forma, setForma] = useState(
    formaAtual && formas.includes(formaAtual) ? formaAtual : "",
  );
  const [estado, acao, pendente] = useActionState(corrigirEstornoAction, {});

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="id" value={estornoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="forma_pagamento">Forma de pagamento *</Label>
          <select
            id="forma_pagamento"
            name="forma_pagamento"
            required
            value={forma}
            onChange={(e) => setForma(e.target.value)}
            className={SELECT}
          >
            <option value="" disabled>
              Escolha…
            </option>
            {formas.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vencimento">
            {forma === "Boleto"
              ? "Vencimento do novo boleto"
              : "Novo vencimento"}
          </Label>
          <Input id="vencimento" name="vencimento" type="date" min={hoje} />
          <p className="text-muted-foreground text-xs">
            Vencimento atual: {vencimentoAtual ?? "não informado"}. Em branco,
            mantém.
          </p>
        </div>
      </div>

      {/* Bloco próprio: o DetalhePagamento ocupa várias colunas no grid da compra. */}
      {forma && (
        <div>
          <DetalhePagamento
            key={forma}
            forma={forma}
            fornecedorId={fornecedorId ?? ""}
            cartoes={[]}
            caixas={[]}
            buscarMeios={buscarMeios}
          />
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="observacao">O que foi conferido ou corrigido? *</Label>
        <textarea
          id="observacao"
          name="observacao"
          rows={3}
          required
          minLength={10}
          placeholder="Ex.: confirmei por telefone com o fornecedor a nova chave Pix (CNPJ); a conta antiga foi encerrada."
          className={TEXTAREA}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        A ordem volta para autorização — mesmo a que tinha autorização
        dispensada — e depois para a fila de pagamento do Financeiro.
      </p>
      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Send />}
        Reencaminhar para autorização
      </Button>
    </form>
  );
}
