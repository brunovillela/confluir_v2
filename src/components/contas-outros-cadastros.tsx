import { Landmark, QrCode } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { contasDeOutrosCadastros, ROTULO_ORIGEM, type TipoDono } from "@/lib/db/dados-bancarios-pessoa"

/**
 * Contas que a pessoa (mesmo CPF) tem nos cadastros de outro papel — usuário,
 * filiado ou fornecedor PF. Elas também valem para os pagamentos a ela aqui;
 * editam-se no cadastro onde estão. Some quando não há nenhuma.
 */
export async function ContasOutrosCadastros({ tipo, id }: { tipo: TipoDono; id: string }) {
  const contas = await contasDeOutrosCadastros(tipo, id)
  if (contas.length === 0) return null
  return (
    <div className="bg-muted/40 grid gap-2 rounded-lg border border-dashed p-3 text-sm">
      <p className="text-muted-foreground text-xs">
        Também valem aqui — contas desta pessoa (mesmo CPF) em outros cadastros. Para mudar, edite onde estão.
      </p>
      {contas.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {c.conta ? (
            <span className="inline-flex items-center gap-1.5">
              <Landmark className="text-muted-foreground size-3.5" />
              {[c.banco, c.agencia ? `ag. ${c.agencia}` : null, `conta ${c.conta}`].filter(Boolean).join(" · ")}
            </span>
          ) : null}
          {c.pix ? (
            <span className="inline-flex items-center gap-1.5 break-all">
              <QrCode className="text-muted-foreground size-3.5" />
              {c.pixTipo ? `${c.pixTipo}: ` : ""}
              {c.pix}
            </span>
          ) : null}
          <Badge variant="outline">{ROTULO_ORIGEM[c.origem]}</Badge>
          {c.favorito && <Badge variant="secondary">principal lá</Badge>}
        </div>
      ))}
    </div>
  )
}
