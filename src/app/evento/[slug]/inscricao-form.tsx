"use client"

import { useActionState, useState } from "react"
import { Loader2, TriangleAlert, UserPlus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { inscreverAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type CampoExtra = {
  id: string
  rotulo: string
  tipo: string
  opcoes: string[]
  ajuda: string | null
  obrigatorio: boolean
}

function CampoDinamico({ campo }: { campo: CampoExtra }) {
  const nome = `campo_${campo.id}`
  const comum = { id: nome, name: nome, required: campo.obrigatorio }

  return (
    <div className="grid gap-2">
      <Label htmlFor={nome}>
        {campo.rotulo}
        {!campo.obrigatorio && (
          <span className="text-muted-foreground font-normal"> (opcional)</span>
        )}
      </Label>
      {campo.tipo === "selecao" ? (
        <select {...comum} className={SELECT} defaultValue="">
          <option value="">Selecione…</option>
          {campo.opcoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : campo.tipo === "sim_nao" ? (
        <select {...comum} className={SELECT} defaultValue="">
          <option value="">Selecione…</option>
          <option value="Sim">Sim</option>
          <option value="Não">Não</option>
        </select>
      ) : campo.tipo === "numero" ? (
        <Input {...comum} type="number" />
      ) : campo.tipo === "data" ? (
        <Input {...comum} type="date" />
      ) : (
        <Textarea {...comum} rows={2} />
      )}
      {campo.ajuda && (
        <p className="text-muted-foreground text-xs">{campo.ajuda}</p>
      )}
    </div>
  )
}

export function InscricaoForm({
  slug,
  campos,
  termoInscricao,
  termoFoto,
  fotoObrigatoria,
  modoFoto,
  retencaoFotoDias,
}: {
  slug: string
  campos: CampoExtra[]
  termoInscricao: string | null
  termoFoto: string | null
  fotoObrigatoria: boolean
  modoFoto: "nenhuma" | "visual" | "biometrica"
  retencaoFotoDias: number
}) {
  const [estado, formAction, pendente] = useActionState(inscreverAction, {})
  const [aceite, setAceite] = useState(false)
  const [aceiteFoto, setAceiteFoto] = useState(false)

  const bloqueado = !aceite || (fotoObrigatoria && !aceiteFoto)

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="slug" value={slug} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Label htmlFor="nome">Nome completo</Label>
        <Input id="nome" name="nome" autoComplete="name" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="telefone">Telefone com DDD</Label>
          <Input
            id="telefone"
            name="telefone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(22) 90000-0000"
            required
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <p className="text-muted-foreground text-xs">
          Enviaremos um código para confirmar. É por ele que você acompanha a
          inscrição.
        </p>
      </div>

      {campos.map((c) => (
        <CampoDinamico key={c.id} campo={c} />
      ))}

      {/* ── Foto: o aviso vem ANTES da captura ── */}
      {fotoObrigatoria && (
        <Alert variant={modoFoto === "biometrica" ? "warning" : "info"}>
          <TriangleAlert />
          <AlertDescription>
            <strong>Neste evento a foto é obrigatória.</strong>{" "}
            {modoFoto === "biometrica"
              ? "Ela será usada para reconhecimento facial no controle de acesso do local — é o que libera sua entrada na catraca. Sem a foto não é possível concluir a inscrição."
              : "Ela será usada para conferir sua identidade na recepção. Sem a foto não é possível concluir a inscrição."}{" "}
            Você tira a foto no passo seguinte, depois de confirmar o e-mail.
          </AlertDescription>
        </Alert>
      )}

      {termoInscricao && (
        <label className="flex items-start gap-3 rounded-md border p-3">
          <input
            type="checkbox"
            name="aceite"
            className="mt-0.5 size-4 shrink-0"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            required
          />
          <span className="grid gap-1">
            <span className="text-sm font-medium">
              Li e aceito o tratamento dos meus dados
            </span>
            <span className="text-muted-foreground text-xs whitespace-pre-wrap">
              {termoInscricao}
            </span>
          </span>
        </label>
      )}

      {fotoObrigatoria && termoFoto && (
        <label className="border-warning/50 flex items-start gap-3 rounded-md border p-3">
          <input
            type="checkbox"
            name="aceite_foto"
            className="mt-0.5 size-4 shrink-0"
            checked={aceiteFoto}
            onChange={(e) => setAceiteFoto(e.target.checked)}
            required
          />
          <span className="grid gap-1">
            <span className="text-sm font-medium">
              {modoFoto === "biometrica"
                ? "Consinto com o uso da minha foto para reconhecimento facial"
                : "Consinto com o uso da minha foto para conferência na recepção"}
            </span>
            <span className="text-muted-foreground text-xs whitespace-pre-wrap">
              {termoFoto}
            </span>
            <span className="text-muted-foreground text-xs">
              A foto é apagada do sistema em até {retencaoFotoDias} dias após o
              fim do evento.
            </span>
          </span>
        </label>
      )}

      <div>
        <Button type="submit" disabled={pendente || bloqueado} className="w-full sm:w-auto">
          {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
          {pendente ? "Enviando…" : "Quero me inscrever"}
        </Button>
      </div>
    </form>
  )
}
