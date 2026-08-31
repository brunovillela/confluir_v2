"use client"

import { useState } from "react"
import { useActionState } from "react"
import { Check, Copy, Loader2, Power, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  alternarAtivoQrCode,
  atualizarQrCode,
  criarQrCode,
  excluirQrCode,
} from "./actions"

export function QrNovoForm({ defaultDestino }: { defaultDestino?: string }) {
  const [estado, action, pend] = useActionState(criarQrCode, {})
  return (
    <form action={action} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Título *</Label>
        <Input
          id="titulo"
          name="titulo"
          placeholder="Ex.: Cartaz da assembleia de outubro"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="finalidade">Finalidade *</Label>
        <Textarea
          id="finalidade"
          name="finalidade"
          rows={2}
          placeholder="Onde será aplicado e para quê (ex.: cartaz impresso nos murais das empresas)"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="destino_url">URL de destino *</Label>
        <Input
          id="destino_url"
          name="destino_url"
          inputMode="url"
          placeholder="https://…"
          defaultValue={defaultDestino ?? ""}
          required
        />
        <p className="text-muted-foreground text-xs">
          O QR carrega um link curto do sistema que redireciona para este
          destino — dá para trocar o destino depois sem reimprimir a peça.
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Gerar QR Code
        </Button>
      </div>
    </form>
  )
}

export function QrEditarForm({
  qr,
}: {
  qr: {
    id: string
    titulo: string | null
    finalidade: string | null
    destino_url: string | null
  }
}) {
  const [estado, action, pend] = useActionState(atualizarQrCode, {})
  return (
    <form action={action} className="grid gap-4">
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
      <input type="hidden" name="id" value={qr.id} />
      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Título *</Label>
        <Input id="titulo" name="titulo" defaultValue={qr.titulo ?? ""} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="finalidade">Finalidade *</Label>
        <Textarea
          id="finalidade"
          name="finalidade"
          rows={2}
          defaultValue={qr.finalidade ?? ""}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="destino_url">URL de destino *</Label>
        <Input
          id="destino_url"
          name="destino_url"
          inputMode="url"
          defaultValue={qr.destino_url ?? ""}
          required
        />
        <p className="text-muted-foreground text-xs">
          Trocar o destino NÃO muda a imagem do QR — as peças já impressas
          passam a apontar para o novo endereço.
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

export function BotaoAlternarAtivo({
  id,
  ativo,
}: {
  id: string
  ativo: boolean
}) {
  const [estado, action, pend] = useActionState(alternarAtivoQrCode, {})
  return (
    <div className="grid gap-2">
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="ativar" value={ativo ? "0" : "1"} />
        <Button
          type="submit"
          variant={ativo ? "outline" : "default"}
          disabled={pend}
        >
          {pend ? <Loader2 className="animate-spin" /> : <Power className="size-4" />}
          {ativo ? "Desativar QR Code" : "Ativar QR Code"}
        </Button>
      </form>
    </div>
  )
}

export function ExcluirQr({ id }: { id: string }) {
  const [estado, action, pend] = useActionState(excluirQrCode, {})
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            "Excluir este QR Code? Peças já impressas com ele deixarão de funcionar e o histórico de leituras será perdido. Se a ideia é só tirá-lo do ar, prefira DESATIVAR."
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      {estado.erro && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        disabled={pend}
        className="text-destructive hover:text-destructive"
      >
        {pend ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir QR Code
      </Button>
    </form>
  )
}

export function BotaoCopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2000)
        } catch {
          // clipboard indisponível — o usuário copia manualmente
        }
      }}
    >
      {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copiado ? "Copiado" : "Copiar link"}
    </Button>
  )
}
