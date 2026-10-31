"use client"

import { useActionState, useRef, useState, useTransition } from "react"
import { Loader2, Sparkles, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TIPOS_REUNIAO } from "@/lib/atas-constantes"
import {
  ROTULO_SIGILO_DELIBERACAO,
  SIGILOS_DELIBERACAO,
  type SigiloDeliberacao,
} from "@/lib/deliberacoes-constantes"
import type { AtaDetalhe } from "@/lib/db/atas"

import {
  atualizarAtaAction,
  criarAtaAction,
  excluirAtaAction,
} from "./actions"
import { extrairAtaDePdf, type DeliberacaoLida } from "./ia-actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function AtaForm({
  ata,
  mandatos,
  mandatoPadrao,
  aoCancelarHref,
  temDeliberacoes = false,
  sigilos,
}: {
  ata?: AtaDetalhe
  mandatos: { id: string; nome: string }[]
  mandatoPadrao?: string
  aoCancelarHref: string
  /** A ata já tem deliberações: as lidas do PDF não entram (não duplica). */
  temDeliberacoes?: boolean
  /** Graus de sigilo que o nível de quem edita alcança. */
  sigilos: SigiloDeliberacao[]
}) {
  // Sigilo do PDF e do resumo: só os graus do nível de quem edita. Já acima do
  // nível não muda; sem nível, fica restrito (a action confere de novo).
  const sigiloAtual = ata?.sigiloDocumento ?? "restrito"
  const sigiloForaDoAlcance = Boolean(ata && !sigilos.includes(ata.sigiloDocumento))
  const sigiloPadrao = sigilos.includes(sigiloAtual) ? sigiloAtual : sigilos[sigilos.length - 1]
  const [estado, formAction, pendente] = useActionState(
    ata ? atualizarAtaAction : criarAtaAction,
    {}
  )
  const mandatoDefault = ata?.mandatoId ?? mandatoPadrao ?? ""
  const formRef = useRef<HTMLFormElement>(null)
  const envio2 = useEnvioFormulario(formAction, estado, {
    ref: formRef,
  })
  const [lendo, iniciarLeitura] = useTransition()
  const [leitura, setLeitura] = useState<{ ok?: string; erro?: string } | null>(null)
  const [lidas, setLidas] = useState<DeliberacaoLida[]>([])

  // Subiu o PDF: a IA lê a ata e preenche o formulário. Numa ata já salva, só
  // os campos vazios — o que alguém digitou não é sobrescrito.
  function lerComIA(arquivo: File | undefined) {
    setLeitura(null)
    setLidas([])
    if (!arquivo || arquivo.type !== "application/pdf") return
    const dados = new FormData()
    dados.set("documento", arquivo)
    iniciarLeitura(async () => {
      const r = await extrairAtaDePdf(dados)
      const form = formRef.current
      if (r.erro || !r.valores || !form) {
        setLeitura({ erro: r.erro ?? "Não foi possível ler a ata." })
        return
      }
      let preenchidos = 0
      for (const [campo, valor] of Object.entries(r.valores)) {
        const el = form.elements.namedItem(campo) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
        if (!el || !valor) continue
        if (ata && el.value.trim()) continue
        el.value = valor
        preenchidos++
      }
      if (!temDeliberacoes) setLidas(r.deliberacoes ?? [])
      setLeitura({
        ok: preenchidos
          ? `A IA preencheu ${preenchidos} ${preenchidos === 1 ? "campo" : "campos"} a partir da ata. Confira antes de salvar.`
          : "A IA leu a ata, mas os campos já estavam preenchidos.",
      })
    })
  }

  return (
    <form action={formAction} {...envio2} className="grid gap-5">
      {ata && <input type="hidden" name="ata_id" value={ata.id} />}
      <input type="hidden" name="deliberacoes_ia" value={JSON.stringify(lidas)} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="bg-muted/40 grid gap-2 rounded-md border p-4">
        <Label htmlFor="documento" className="flex items-center gap-1.5">
          <Sparkles className="text-primary size-4" />
          Ata em PDF{ata ? " (vazio mantém a atual)" : ""}
        </Label>
        <Input
          id="documento"
          name="documento"
          type="file"
          accept="application/pdf"
          onChange={(e) => lerComIA(e.target.files?.[0])}
        />
        <p className="text-muted-foreground text-xs">
          Ao escolher o arquivo, a IA lê a ata e preenche título, tipo, data, hora, local, pauta,
          resumo e presentes{ata ? " que estiverem vazios" : ""}, e separa as deliberações. Confira antes
          de salvar.
        </p>
        {lendo && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Lendo a ata com IA…
          </p>
        )}
        <div className="grid max-w-72 gap-1.5">
          <Label htmlFor="sigilo_documento">Sigilo do PDF e do resumo</Label>
          {sigiloForaDoAlcance ? (
            <p className="text-muted-foreground text-sm">
              {ROTULO_SIGILO_DELIBERACAO[sigiloAtual]} — acima do seu acesso; não muda.
            </p>
          ) : sigilos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Restrito (seu acesso às deliberações é nenhum).</p>
          ) : (
            <select id="sigilo_documento" name="sigilo_documento" className={SELECT} defaultValue={sigiloPadrao}>
              {SIGILOS_DELIBERACAO.filter((s) => sigilos.includes(s.chave)).map((s) => (
                <option key={s.chave} value={s.chave}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          )}
          <p className="text-muted-foreground text-xs">
            O PDF traz todas as decisões: ele e o resumo só aparecem para quem tem acesso às deliberações até
            este grau.
          </p>
        </div>
        {leitura?.ok && <p className="text-success-fg text-sm">{leitura.ok}</p>}
        {leitura?.erro && <p className="text-destructive text-sm">{leitura.erro}</p>}
        {lidas.length > 0 && (
          <div className="grid gap-1.5 text-sm">
            <p>
              A IA encontrou {lidas.length} {lidas.length === 1 ? "deliberação" : "deliberações"}. Ao salvar,
              {lidas.length === 1 ? " ela entra" : " elas entram"} no cartão Deliberações como <em>a cumprir</em> e{" "}
              <em>reservado</em> — ajuste a situação e o sigilo depois.
            </p>
            <ol className="text-muted-foreground list-decimal pl-5 text-xs">
              {lidas.map((d, i) => (
                <li key={i}>{d.assunto}</li>
              ))}
            </ol>
            <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setLidas([])}>
              Não registrar estas deliberações
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="mandato_id">Mandato</Label>
          <select
            id="mandato_id"
            name="mandato_id"
            className={SELECT}
            defaultValue={mandatoDefault}
          >
            <option value="">(sem mandato)</option>
            {mandatos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tipo">Tipo de reunião</Label>
          <select
            id="tipo"
            name="tipo"
            className={SELECT}
            defaultValue={ata?.tipo ?? "diretoria"}
          >
            {TIPOS_REUNIAO.map((t) => (
              <option key={t.chave} value={t.chave}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="orgao">Órgão (quando o tipo for outra)</Label>
          <Input id="orgao" name="orgao" defaultValue={ata?.orgao ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data">Data</Label>
          <input
            id="data"
            name="data"
            type="date"
            className={DATA}
            defaultValue={ata?.data?.slice(0, 10) ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          name="titulo"
          defaultValue={ata?.titulo ?? ""}
          placeholder="Ex.: Reunião ordinária — julho/2025"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="hora">Hora</Label>
          <Input id="hora" name="hora" defaultValue={ata?.hora ?? ""} placeholder="Ex.: 14h00" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="local">Local</Label>
          <Input id="local" name="local" defaultValue={ata?.local ?? ""} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="pauta">Pauta</Label>
        <Textarea id="pauta" name="pauta" rows={3} defaultValue={ata?.pauta ?? ""} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="resumo">Resumo da reunião</Label>
        {sigiloForaDoAlcance ? (
          <p className="text-muted-foreground text-sm">
            O resumo é {ROTULO_SIGILO_DELIBERACAO[sigiloAtual].toLowerCase()}, acima do seu acesso — fica como está.
          </p>
        ) : (
          <>
            <Textarea
              id="resumo"
              name="resumo"
              rows={3}
              defaultValue={ata?.resumo ?? ""}
              placeholder="Em poucas frases, o que se discutiu."
            />
            <p className="text-muted-foreground text-xs">
              As decisões não vão aqui: cada uma é registrada no cartão Deliberações da ata, com situação e
              sigilo. O resumo segue o sigilo do PDF.
            </p>
          </>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="presentes">Presentes</Label>
        <Textarea
          id="presentes"
          name="presentes"
          rows={3}
          placeholder="Um nome por linha."
          defaultValue={ata?.presentes ?? ""}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          name="observacoes"
          rows={2}
          defaultValue={ata?.observacoes ?? ""}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente || lendo}>
          {pendente && <Loader2 className="animate-spin" />}
          {ata ? "Salvar ata" : "Criar ata"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirAta({
  ataId,
  mandatoId,
}: {
  ataId: string
  mandatoId: string | null
}) {
  const [estado, formAction, pendente] = useActionState(excluirAtaAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio}>
      <input type="hidden" name="ata_id" value={ataId} />
      {mandatoId && <input type="hidden" name="mandato_id" value={mandatoId} />}
      {estado.erro && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive size-4" />
        )}
        Excluir
      </Button>
    </form>
  )
}
