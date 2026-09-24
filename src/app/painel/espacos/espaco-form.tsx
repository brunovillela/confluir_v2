"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  PUBLICOS_ALVO,
  VISITAS_TECNICAS,
  motivoInelegivel,
} from "@/lib/espacos-constantes"

import { criarEspacoAction, atualizarEspacoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type AmbienteOpcao = {
  id: string
  nome: string
  sede: string | null
  falta: string[]
  responsavelId: string | null
  responsavelNome: string | null
}

export type EspacoFormDados = {
  id: string
  nome: string
  descricao: string | null
  sedeId: string | null
  capacidade: number | null
  visita: string
  exigeTermo: boolean
  exigeAutorizacao: boolean
  publico: string
  agendaPublica: boolean
  responsavelVisitaId: string | null
  ativo: boolean
  recintoIds: string[]
  recintoPrincipalId: string | null
}

export function EspacoForm({
  espaco,
  sedes,
  ambientes,
  responsaveis,
}: {
  espaco?: EspacoFormDados
  sedes: { id: string; nome: string }[]
  ambientes: AmbienteOpcao[]
  responsaveis: { id: string; nome: string; vinculo: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(
    espaco ? atualizarEspacoAction : criarEspacoAction,
    {}
  )
  const [escolhidos, setEscolhidos] = useState<string[]>(espaco?.recintoIds ?? [])
  const [principal, setPrincipal] = useState<string>(
    espaco?.recintoPrincipalId ?? ""
  )

  const elegiveis = ambientes.filter((a) => a.falta.length === 0)
  const inelegiveis = ambientes.filter((a) => a.falta.length > 0)

  /**
   * A sugestão de responsável vem do ambiente principal; não havendo, do
   * primeiro ambiente escolhido que tenha responsável.
   */
  const sugestao =
    ambientes.find((a) => a.id === principal && a.responsavelId) ??
    ambientes.find((a) => escolhidos.includes(a.id) && a.responsavelId)

  const alternar = (id: string) => {
    setEscolhidos((atual) => {
      const novo = atual.includes(id)
        ? atual.filter((x) => x !== id)
        : [...atual, id]
      if (!novo.includes(principal)) setPrincipal(novo[0] ?? "")
      else if (!principal && novo.length === 1) setPrincipal(novo[0])
      return novo
    })
  }

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {espaco && <input type="hidden" name="id" value={espaco.id} />}
      <input type="hidden" name="recintos" value={escolhidos.join(",")} />
      <input type="hidden" name="recinto_principal" value={principal} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O espaço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              name="nome"
              required
              defaultValue={espaco?.nome ?? ""}
              placeholder="Ex.: Auditório — plateia"
            />
            <p className="text-muted-foreground text-xs">
              É como o espaço aparece para quem solicita.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sede_id">Sede *</Label>
            <select
              id="sede_id"
              name="sede_id"
              required
              defaultValue={espaco?.sedeId ?? ""}
              className={SELECT}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="capacidade">Lotação (pessoas)</Label>
            <Input
              id="capacidade"
              name="capacidade"
              type="number"
              min={1}
              defaultValue={espaco?.capacidade ?? ""}
            />
            <p className="text-muted-foreground text-xs">
              A deste arranjo — plateia, mesas ou de pé mudam o número. É ela que
              define bombeiros e seguranças.
            </p>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              name="descricao"
              rows={3}
              defaultValue={espaco?.descricao ?? ""}
              placeholder="O que o espaço tem: palco, som, ar-condicionado, acesso, estacionamento…"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ambientes que o espaço ocupa
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground text-sm">
            Vêm do cadastro de recintos do Patrimônio. Marque todos os que a
            cessão ocupa — ceder este espaço bloqueia qualquer outro que
            compartilhe um ambiente marcado.
          </p>
          {elegiveis.length === 0 ? (
            <Alert variant="warning">
              <AlertDescription>
                Nenhum ambiente está com o cadastro completo. Complete em
                Patrimônio › Recintos, ou siga sem ambiente por enquanto.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {elegiveis.map((a) => (
                <label
                  key={a.id}
                  className="hover:bg-muted/40 flex items-start gap-2 rounded-md border p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={escolhidos.includes(a.id)}
                    onChange={() => alternar(a.id)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.nome}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {a.sede ?? "sem sede"}
                      {a.responsavelNome ? ` · resp.: ${a.responsavelNome}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {escolhidos.length > 1 && (
            <div className="grid gap-1.5">
              <Label htmlFor="principal">Ambiente principal</Label>
              <select
                id="principal"
                className={SELECT}
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              >
                {escolhidos.map((id) => (
                  <option key={id} value={id}>
                    {ambientes.find((a) => a.id === id)?.nome ?? id}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Dá nome ao conjunto e é dele que sai a sugestão de responsável
                pela visita.
              </p>
            </div>
          )}

          {inelegiveis.length > 0 && (
            <details className="text-sm">
              <summary className="text-muted-foreground cursor-pointer">
                {inelegiveis.length} ambiente
                {inelegiveis.length === 1 ? "" : "s"} ainda não
                {inelegiveis.length === 1 ? " pode" : " podem"} ser usado
                {inelegiveis.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 grid gap-1">
                {inelegiveis.map((a) => (
                  <li
                    key={a.id}
                    className="text-muted-foreground flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-xs"
                  >
                    <span className="font-medium">{a.nome}</span>
                    <span>({motivoInelegivel(a.falta)})</span>
                    <Link
                      href={`/painel/patrimonio/recintos/${a.id}`}
                      className="text-primary hover:underline"
                    >
                      completar cadastro
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regras da cessão</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="publico">Quem pode solicitar *</Label>
            <select
              id="publico"
              name="publico"
              required
              defaultValue={espaco?.publico ?? "qualquer"}
              className={SELECT}
            >
              {PUBLICOS_ALVO.map((p) => (
                <option key={p.chave} value={p.chave}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="visita">Visita técnica *</Label>
            <select
              id="visita"
              name="visita"
              required
              defaultValue={espaco?.visita ?? "facultativa"}
              className={SELECT}
            >
              {VISITAS_TECNICAS.map((v) => (
                <option key={v.chave} value={v.chave}>
                  {v.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="responsavel">Responsável pela visita técnica</Label>
            <select
              id="responsavel"
              name="responsavel"
              defaultValue={espaco?.responsavelVisitaId ?? sugestao?.responsavelId ?? ""}
              className={SELECT}
            >
              <option value="">Definir na hora da cessão</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome} — {r.vinculo}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              {sugestao?.responsavelNome
                ? `Sugerido pelo ambiente ${sugestao.nome}: ${sugestao.responsavelNome}. Pode trocar por qualquer funcionário ou diretor.`
                : "Funcionários e diretores. Cada cessão pode usar outra pessoa."}
            </p>
          </div>

          <Marcador
            nome="exige_termo"
            rotulo="Exige termo de cessão"
            ajuda="O termo é gerado, assinado pelas duas partes e fica anexado à cessão."
            padrao={espaco?.exigeTermo ?? true}
          />
          <Marcador
            nome="exige_autorizacao"
            rotulo="Exige autorização"
            ajuda="A avaliação política antes de confirmar a cessão."
            padrao={espaco?.exigeAutorizacao ?? true}
          />
          <Marcador
            nome="agenda_publica"
            rotulo="Mostrar a agenda no link público"
            ajuda="Desligue quando a ocupação do espaço não deve ficar à vista."
            padrao={espaco?.agendaPublica ?? true}
          />
          <Marcador
            nome="ativo"
            rotulo="Disponível para cessão"
            ajuda="Desligue para tirar o espaço de circulação sem apagar o cadastro."
            padrao={espaco?.ativo ?? true}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href={espaco ? `/painel/espacos/${espaco.id}` : "/painel/espacos"}>
            Cancelar
          </Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {espaco ? "Salvar espaço" : "Cadastrar espaço"}
        </Button>
      </div>
    </form>
  )
}

function Marcador({
  nome,
  rotulo,
  ajuda,
  padrao,
}: {
  nome: string
  rotulo: string
  ajuda: string
  padrao: boolean
}) {
  return (
    <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
      <input type="checkbox" name={nome} defaultChecked={padrao} className="mt-1" />
      <span>
        <span className="block font-medium">{rotulo}</span>
        <span className="text-muted-foreground block text-xs">{ajuda}</span>
      </span>
    </label>
  )
}
