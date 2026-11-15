"use client"

import { useActionState, useState } from "react"
import { Archive, Copy, Link2, Loader2, Mail, RefreshCw, Unlink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"
import { formatarDataHora } from "@/lib/formato"

import { arquivarEnvioAction, enviarLinkAction, gerarLinkAction, revogarLinkAction } from "./actions"

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <p className="text-destructive text-sm">{estado.erro}</p>
  if (estado.ok) return <p className="text-success-fg text-sm">{estado.ok}</p>
  return null
}

/** O link do RH da empresa: gerar, copiar, mandar por e-mail, trocar ou desativar. */
export function LinkRh({
  empresaId,
  link,
  contatos,
}: {
  empresaId: string
  link: { url: string; criadoEm: string; criadoPor: string | null; ultimoAcessoEm: string | null } | null
  contatos: { id: string; nome: string; email: string | null }[]
}) {
  const [eGerar, aGerar, pGerar] = useActionState<EstadoForm, FormData>(gerarLinkAction, {})
  const [eRev, aRev, pRev] = useActionState<EstadoForm, FormData>(revogarLinkAction, {})
  const [eEnv, aEnv, pEnv] = useActionState<EstadoForm, FormData>(enviarLinkAction, {})
  const envio = useEnvioFormulario(aEnv, eEnv)
  const [copiado, setCopiado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const comEmail = contatos.filter((c) => c.email)

  if (!link) {
    return (
      <form action={aGerar} className="grid gap-2">
        <input type="hidden" name="empresa_id" value={empresaId} />
        <p className="text-muted-foreground text-sm">
          Um endereço próprio da empresa, sem login, para o RH mandar a relação do mês (ou dizer que não houve desconto) e
          confirmar as inclusões e exclusões.
        </p>
        <Button type="submit" size="sm" className="w-fit" disabled={pGerar}>
          {pGerar ? <Loader2 className="animate-spin" /> : <Link2 />}
          Gerar link do RH
        </Button>
        <Mensagem estado={eGerar} />
      </form>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <Input readOnly value={link.url} className="h-9 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(link.url).catch(() => {})
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2000)
          }}
        >
          <Copy />
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Gerado em {formatarDataHora(link.criadoEm)}
        {link.criadoPor && ` por ${link.criadoPor}`} ·{" "}
        {link.ultimoAcessoEm ? `último acesso em ${formatarDataHora(link.ultimoAcessoEm)}` : "ainda não foi aberto"}
      </p>
      <div className="flex flex-wrap gap-2">
        {comEmail.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={() => setEnviando(!enviando)}>
            <Mail />
            Enviar ao contato da folha
          </Button>
        )}
        <form action={aGerar} onSubmit={(e) => { if (!confirm("Gerar outro link? O atual deixa de funcionar.")) e.preventDefault() }}>
          <input type="hidden" name="empresa_id" value={empresaId} />
          <Button type="submit" size="sm" variant="ghost" disabled={pGerar}>
            {pGerar ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Gerar outro
          </Button>
        </form>
        <form action={aRev} onSubmit={(e) => { if (!confirm("Desativar o link? O RH não conseguirá mais usá-lo.")) e.preventDefault() }}>
          <input type="hidden" name="empresa_id" value={empresaId} />
          <Button type="submit" size="sm" variant="ghost" disabled={pRev}>
            {pRev ? <Loader2 className="animate-spin" /> : <Unlink />}
            Desativar
          </Button>
        </form>
      </div>
      {enviando && (
        <form action={aEnv} {...envio} className="grid gap-2 rounded-lg border p-3">
          <input type="hidden" name="empresa_id" value={empresaId} />
          {comEmail.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="contato" value={c.id} defaultChecked className="accent-primary size-4" />
              {c.nome} <span className="text-muted-foreground">({c.email})</span>
            </label>
          ))}
          <Button type="submit" size="sm" className="w-fit" disabled={pEnv}>
            {pEnv ? <Loader2 className="animate-spin" /> : <Mail />}
            Enviar o link
          </Button>
        </form>
      )}
      {comEmail.length === 0 && <p className="text-muted-foreground text-xs">Cadastre um contato da folha com e-mail para mandar o link daqui.</p>}
      <Mensagem estado={eGerar} />
      <Mensagem estado={eRev} />
      <Mensagem estado={eEnv} />
    </div>
  )
}

export function ArquivarEnvio({ envioId, empresaId }: { envioId: string; empresaId: string }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(arquivarEnvioAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!confirm("Arquivar este envio? Use quando o arquivo estiver errado ou tiver sido substituído.")) e.preventDefault()
      }}
      className="inline"
    >
      <input type="hidden" name="envio_id" value={envioId} />
      <input type="hidden" name="empresa_id" value={empresaId} />
      <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Archive />}
        Arquivar
      </Button>
      {estado.erro && <span className="text-destructive ml-2 text-xs">{estado.erro}</span>}
    </form>
  )
}
