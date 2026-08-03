"use client"

import { useActionState } from "react"
import { Loader2, UserPlus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

import { alternarUsuarioHotel, criarUsuarioHotel } from "../actions"

export type UsuarioHotelLinha = {
  id: string
  email: string
  nome: string | null
  auth_user_id: string | null
  ativo: boolean
}

/**
 * Acessos da interface do hotel (/hotel): quem do hotel pode ver os cupons
 * e registrar as reservas. O convite chega por email.
 */
export function UsuariosHotel({
  hotelId,
  usuarios,
  disponivel,
}: {
  hotelId: string
  usuarios: UsuarioHotelLinha[]
  disponivel: boolean
}) {
  const [estadoCriar, criarAction, criando] = useActionState(criarUsuarioHotel, {})
  const [estadoAlt, altAction, alternando] = useActionState(alternarUsuarioHotel, {})

  const erro = estadoCriar.erro ?? estadoAlt.erro
  const ok = estadoCriar.ok ?? estadoAlt.ok

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Usuários do hotel</CardTitle>
        <CardDescription>
          Pessoal do hotel com acesso à área /hotel — enxergam só os cupons e
          reservas deste hotel e registram os serviços.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!disponivel && (
          <Alert>
            <AlertDescription>
              A tabela de usuários de hotel ainda não existe no banco — rode{" "}
              <code>supabase/hospedagem-hotel.sql</code> no SQL Editor do
              Supabase para habilitar a interface do hotel.
            </AlertDescription>
          </Alert>
        )}
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

        {disponivel && (
          <>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-muted-foreground h-20 text-center text-sm"
                      >
                        Nenhum acesso criado para este hotel.
                      </TableCell>
                    </TableRow>
                  )}
                  {usuarios.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="max-w-48 truncate font-medium">
                        {u.nome ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-56 truncate">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        {u.ativo ? (
                          <Badge
                            variant="outline"
                            className="border-success/40 text-success-fg"
                          >
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Desativado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <form action={altAction}>
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="hotel_id" value={hotelId} />
                          <input
                            type="hidden"
                            name="ativo"
                            value={String(!u.ativo)}
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            disabled={alternando}
                            className={
                              u.ativo
                                ? "text-destructive hover:text-destructive h-7 px-2"
                                : "h-7 px-2"
                            }
                          >
                            {alternando && <Loader2 className="animate-spin" />}
                            {u.ativo ? "Desativar" : "Reativar"}
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <form
              action={criarAction}
              className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <input type="hidden" name="hotel_id" value={hotelId} />
              <div className="grid gap-1.5">
                <Label htmlFor="usuario_nome">Nome</Label>
                <Input id="usuario_nome" name="nome" placeholder="Recepção / gerente" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="usuario_email">Email *</Label>
                <Input id="usuario_email" name="email" type="email" required />
              </div>
              <Button type="submit" variant="secondary" disabled={criando}>
                {criando ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Convidar
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  )
}
