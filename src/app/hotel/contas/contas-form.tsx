"use client"

import { useActionState, useState } from "react"
import { Loader2, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { alternarContaHotel, criarContaHotel } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type ContaLinha = {
  id: string
  tipo: "pix" | "deposito"
  titular: string | null
  documento: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  chave_pix: string | null
  ativo: boolean
}

export function ContasHotel({ contas }: { contas: ContaLinha[] }) {
  const [estadoCriar, criarAction, criando] = useActionState(criarContaHotel, {})
  const [estadoAlt, altAction, alternando] = useActionState(alternarContaHotel, {})
  const [tipo, setTipo] = useState<"pix" | "deposito">("pix")

  const erro = estadoCriar.erro ?? estadoAlt.erro
  const ok = estadoCriar.ok ?? estadoAlt.ok

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{ok}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contas cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Tipo</TableHead>
                  <TableHead>Dados</TableHead>
                  <TableHead className="hidden sm:table-cell">Titular</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contas.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Nenhuma conta cadastrada — cadastre para receber os
                      faturamentos.
                    </TableCell>
                  </TableRow>
                )}
                {contas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {c.tipo === "pix" ? "Pix" : "Depósito (TED)"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-64 truncate text-sm">
                      {c.tipo === "pix"
                        ? (c.chave_pix ?? "—")
                        : [c.banco, c.agencia && `ag. ${c.agencia}`, c.conta && `conta ${c.conta}`]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-48 truncate text-sm sm:table-cell">
                      {c.titular ?? "—"}
                      {c.documento ? ` · ${c.documento}` : ""}
                    </TableCell>
                    <TableCell>
                      {c.ativo ? (
                        <Badge
                          variant="outline"
                          className="border-success/40 text-success-fg"
                        >
                          Ativa
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Desativada
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <form action={altAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="ativo" value={String(!c.ativo)} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={alternando}
                          className={
                            c.ativo
                              ? "text-destructive hover:text-destructive h-7 px-2"
                              : "h-7 px-2"
                          }
                        >
                          {alternando && <Loader2 className="animate-spin" />}
                          {c.ativo ? "Desativar" : "Reativar"}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova conta</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={criarAction} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tipo">Tipo *</Label>
              <select
                id="tipo"
                name="tipo"
                className={SELECT}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "pix" | "deposito")}
              >
                <option value="pix">Pix</option>
                <option value="deposito">Depósito bancário (TED)</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="titular">Titular</Label>
              <Input id="titular" name="titular" />
            </div>
            {tipo === "pix" ? (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="chave_pix">Chave Pix *</Label>
                <Input
                  id="chave_pix"
                  name="chave_pix"
                  placeholder="CNPJ, email, telefone ou chave aleatória"
                  required
                />
              </div>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="documento">CNPJ/CPF do titular</Label>
                  <Input id="documento" name="documento" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="banco">Banco *</Label>
                  <Input id="banco" name="banco" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="agencia">Agência</Label>
                  <Input id="agencia" name="agencia" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="conta">Conta *</Label>
                  <Input id="conta" name="conta" required />
                </div>
              </>
            )}
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" variant="secondary" disabled={criando}>
                {criando ? <Loader2 className="animate-spin" /> : <Plus />}
                Cadastrar conta
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
