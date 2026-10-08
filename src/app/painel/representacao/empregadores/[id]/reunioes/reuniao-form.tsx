"use client"

import { useActionState, useMemo, useRef, useState, useTransition } from "react"
import { FileText, Loader2, Save, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ReuniaoDetalhe } from "@/lib/db/representacao-reunioes"
import {
  INFO_TIPO_REUNIAO,
  juntarNomeCargo,
  MODALIDADES_REUNIAO,
  SITUACOES_REUNIAO_REP,
  type ModalidadeReuniao,
  type TipoReuniaoRep,
} from "@/lib/representacao-reunioes-constantes"

import { lerAtaAction, prepararEnvioAtaAction, salvarReuniaoAction } from "./actions"

const CAMPO =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()

export function ReuniaoForm({
  empresaId,
  tipo,
  reuniao,
  usuarios,
  aoCancelarHref,
}: {
  empresaId: string
  tipo: TipoReuniaoRep
  reuniao?: ReuniaoDetalhe
  /** Diretores e funcionários com conta (participantes do sindicato). */
  usuarios: { id: string; nome: string }[]
  aoCancelarHref: string
}) {
  const [estado, acao, pendente] = useActionState(salvarReuniaoAction, {})
  const info = INFO_TIPO_REUNIAO[tipo]
  const formRef = useRef<HTMLFormElement>(null)
  const [modalidade, setModalidade] = useState<ModalidadeReuniao>(reuniao?.modalidade ?? "presencial")
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set((reuniao?.participantes ?? []).filter((p) => p.lado === "sindicato" && p.usuarioId).map((p) => p.usuarioId!))
  )
  const [filtroUsuarios, setFiltroUsuarios] = useState("")
  const [ata, setAta] = useState<{ caminho: string; nome: string } | null>(null)
  const [removerAta, setRemoverAta] = useState(false)
  const [resumoPorIA, setResumoPorIA] = useState(reuniao?.resumoPorIA ?? false)
  const [lendo, iniciar] = useTransition()
  const [etapa, setEtapa] = useState<string | null>(null)
  const [leitura, setLeitura] = useState<{ ok?: string; erro?: string } | null>(null)

  const linhasDe = (lado: "sindicato" | "empresa" | "trabalhador") =>
    (reuniao?.participantes ?? [])
      .filter((p) => p.lado === lado && !(lado === "sindicato" && p.usuarioId))
      .map(juntarNomeCargo)
      .join("\n")

  const visiveis = useMemo(() => {
    const f = normalizar(filtroUsuarios)
    return f ? usuarios.filter((u) => normalizar(u.nome).includes(f) || marcados.has(u.id)) : usuarios
  }, [filtroUsuarios, usuarios, marcados])

  const alternar = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  /** Envia o PDF direto ao armazenamento e pede à IA para ler a ata. */
  function enviarAta(arquivo: File | undefined) {
    setLeitura(null)
    if (!arquivo) return
    if (arquivo.type !== "application/pdf") {
      setLeitura({ erro: "A ata precisa ser um PDF." })
      return
    }
    if (arquivo.size > 25 * 1024 * 1024) {
      setLeitura({ erro: "A ata passa de 25 MB." })
      return
    }
    iniciar(async () => {
      setEtapa("Enviando a ata…")
      const envio = await prepararEnvioAtaAction()
      if (envio.erro || !envio.caminho || !envio.token) {
        setEtapa(null)
        setLeitura({ erro: envio.erro ?? "Não foi possível enviar." })
        return
      }
      const { createClient } = await import("@/lib/supabase/client")
      const { error } = await createClient()
        .storage.from("representacao")
        .uploadToSignedUrl(envio.caminho, envio.token, arquivo, { contentType: "application/pdf" })
      if (error) {
        setEtapa(null)
        setLeitura({ erro: `Falha ao enviar a ata: ${error.message}` })
        return
      }
      setAta({ caminho: envio.caminho, nome: arquivo.name })
      setRemoverAta(false)

      setEtapa("Lendo a ata com IA…")
      const r = await lerAtaAction(envio.caminho, tipo)
      setEtapa(null)
      const form = formRef.current
      if (r.erro || !r.valores || !form) {
        setLeitura({ erro: `Ata anexada. ${r.erro ?? "A IA não conseguiu ler a ata."} Preencha à mão.` })
        return
      }
      let preenchidos = 0
      // Numa reunião já salva, só os campos vazios — o que alguém digitou fica.
      const preencher = (nome: string, valor: string | undefined) => {
        const el = form.elements.namedItem(nome) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
        if (!el || !valor) return
        if (reuniao && el.value.trim()) return
        el.value = valor
        if (nome === "modalidade") setModalidade(valor as ModalidadeReuniao)
        if (nome === "resumo") setResumoPorIA(true)
        preenchidos++
      }
      for (const campo of ["titulo", "data", "hora_inicio", "hora_fim", "modalidade", "local", "pauta", "resumo", "encaminhamentos", "unidade", "presentes_total", "participantes_empresa", "trabalhadores"]) {
        preencher(campo, r.valores[campo])
      }
      // Do sindicato: quem tem conta é marcado; o resto vai para "outros".
      const outros: string[] = []
      for (const l of (r.valores.participantes_sindicato ?? "").split("\n").map((s) => s.trim()).filter(Boolean)) {
        const nome = normalizar(l.split(/\s+[—–-]\s+/)[0])
        const u = usuarios.find((x) => {
          const n = normalizar(x.nome)
          return n === nome || n.startsWith(`${nome} `) || nome.startsWith(`${n} `)
        })
        if (u) setMarcados((atual) => new Set(atual).add(u.id))
        else outros.push(l)
      }
      if (outros.length) preencher("sindicato_outros", outros.join("\n"))
      setLeitura({
        ok: `Ata anexada. A IA preencheu ${preenchidos} campo(s)${reuniao ? " que estavam vazios" : ""}. Confira antes de salvar.`,
      })
    })
  }

  const setorial = tipo === "setorial"

  return (
    <form ref={formRef} action={acao} className="grid gap-5">
      <input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="tipo" value={tipo} />
      {reuniao && <input type="hidden" name="reuniao_id" value={reuniao.id} />}
      <input type="hidden" name="ata_caminho" value={ata?.caminho ?? ""} />
      <input type="hidden" name="ata_nome" value={ata?.nome ?? ""} />
      <input type="hidden" name="ata_remover" value={removerAta ? "1" : ""} />
      <input type="hidden" name="resumo_por_ia" value={resumoPorIA ? "1" : ""} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="bg-muted/40 grid gap-2 rounded-md border p-4">
        <Label htmlFor="ata" className="flex items-center gap-1.5">
          <Sparkles className="text-primary size-4" />
          Ata em PDF (opcional)
        </Label>
        {reuniao?.temAta && !ata && !removerAta && (
          <p className="text-sm">
            <a href={reuniao.ataUrl ?? "#"} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
              <FileText className="size-4" />
              {reuniao.ataNome ?? "ata.pdf"}
            </a>
            <button type="button" onClick={() => setRemoverAta(true)} className="text-destructive ml-3 text-xs hover:underline">
              remover ata
            </button>
          </p>
        )}
        {removerAta && (
          <p className="text-muted-foreground text-xs">
            A ata atual será removida ao salvar.{" "}
            <button type="button" onClick={() => setRemoverAta(false)} className="text-primary hover:underline">
              desfazer
            </button>
          </p>
        )}
        {ata && <p className="text-success-fg text-sm">Anexada: {ata.nome}</p>}
        <Input
          id="ata"
          type="file"
          accept="application/pdf"
          disabled={lendo}
          onChange={(e) => enviarAta(e.target.files?.[0])}
        />
        <p className="text-muted-foreground text-xs">
          Ao escolher o arquivo, a IA lê a ata (digital ou escaneada) e preenche data, horário, local, pauta, resumo,
          encaminhamentos e participantes{reuniao ? " que estiverem vazios" : ""}. Confira antes de salvar.
        </p>
        {etapa && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {etapa}
          </p>
        )}
        {leitura?.ok && <p className="text-success-fg text-sm">{leitura.ok}</p>}
        {leitura?.erro && <p className="text-destructive text-sm">{leitura.erro}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          name="titulo"
          required
          defaultValue={reuniao?.titulo ?? ""}
          placeholder={setorial ? "Ex.: Setorial na P-50 — turno A" : "Ex.: Reunião sobre escala de embarque"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="situacao">Situação</Label>
          <select id="situacao" name="situacao" className={CAMPO} defaultValue={reuniao?.situacao ?? "realizada"}>
            {SITUACOES_REUNIAO_REP.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data">Data</Label>
          <input id="data" name="data" type="date" required className={CAMPO} defaultValue={reuniao?.data ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hora_inicio">Início</Label>
          <input id="hora_inicio" name="hora_inicio" type="time" className={CAMPO} defaultValue={reuniao?.horaInicio ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hora_fim">Término</Label>
          <input id="hora_fim" name="hora_fim" type="time" className={CAMPO} defaultValue={reuniao?.horaFim ?? ""} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="modalidade">Modalidade</Label>
          <select
            id="modalidade"
            name="modalidade"
            className={CAMPO}
            value={modalidade}
            onChange={(e) => setModalidade(e.target.value as ModalidadeReuniao)}
          >
            {MODALIDADES_REUNIAO.map((m) => (
              <option key={m.chave} value={m.chave}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className={`grid gap-1.5 ${modalidade === "presencial" ? "sm:col-span-2" : ""}`}>
          <Label htmlFor="local">Local</Label>
          <Input
            id="local"
            name="local"
            defaultValue={reuniao?.local ?? ""}
            placeholder={setorial ? "Ex.: refeitório da base de Imbetiba" : "Ex.: sede da empresa, sala 302"}
          />
        </div>
        {modalidade !== "presencial" && (
          <div className="grid gap-1.5">
            <Label htmlFor="link_online">Link da reunião on-line</Label>
            <Input id="link_online" name="link_online" type="url" defaultValue={reuniao?.linkOnline ?? ""} placeholder="https://…" />
          </div>
        )}
      </div>

      {setorial && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="unidade">Unidade / local de trabalho</Label>
            <Input id="unidade" name="unidade" defaultValue={reuniao?.unidade ?? ""} placeholder="Ex.: P-50, turno A · Base de Imbetiba" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="presentes_total">Trabalhadores presentes</Label>
            <input
              id="presentes_total"
              name="presentes_total"
              type="number"
              min={0}
              className={CAMPO}
              defaultValue={reuniao?.presentesTotal ?? ""}
            />
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="pauta">Pauta</Label>
        <Textarea id="pauta" name="pauta" rows={3} defaultValue={reuniao?.pauta ?? ""} placeholder="Um assunto por linha" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="resumo" className="flex items-center gap-1.5">
          Resumo
          {resumoPorIA && (
            <span className="text-primary inline-flex items-center gap-1 text-xs font-normal">
              <Sparkles className="size-3" /> escrito pela IA a partir da ata — revise
            </span>
          )}
        </Label>
        <Textarea id="resumo" name="resumo" rows={5} defaultValue={reuniao?.resumo ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="encaminhamentos">Encaminhamentos</Label>
        <Textarea
          id="encaminhamentos"
          name="encaminhamentos"
          rows={3}
          defaultValue={reuniao?.encaminhamentos ?? ""}
          placeholder="Decisões, compromissos e prazos — um por linha"
        />
      </div>

      <fieldset className="grid gap-3 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">Participantes</legend>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2">
            <p className="text-sm font-medium">Pelo sindicato</p>
            <input
              type="search"
              value={filtroUsuarios}
              onChange={(e) => setFiltroUsuarios(e.target.value)}
              placeholder="Buscar diretor ou funcionário"
              aria-label="Buscar diretor ou funcionário"
              className={CAMPO}
            />
            <div className="grid max-h-52 gap-1 overflow-y-auto rounded-md border p-2">
              {visiveis.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="sindicato_usuario"
                    value={u.id}
                    checked={marcados.has(u.id)}
                    onChange={() => alternar(u.id)}
                    className="size-4"
                  />
                  {u.nome}
                </label>
              ))}
              {!visiveis.length && <p className="text-muted-foreground text-xs">Ninguém com esse nome.</p>}
            </div>
            <Label htmlFor="sindicato_outros" className="text-xs font-normal">
              Outros pelo sindicato (sem conta no sistema) — um por linha, &quot;Nome — cargo&quot;
            </Label>
            <Textarea id="sindicato_outros" name="sindicato_outros" rows={2} defaultValue={linhasDe("sindicato")} />
          </div>
          <div className="grid content-start gap-2">
            {setorial ? (
              <>
                <Label htmlFor="trabalhadores">Trabalhadores (opcional) — um por linha, &quot;Nome — função&quot;</Label>
                <Textarea id="trabalhadores" name="trabalhadores" rows={9} defaultValue={linhasDe("trabalhador")} />
              </>
            ) : (
              <>
                <Label htmlFor="participantes_empresa">Pela empresa — um por linha, &quot;Nome — cargo&quot;</Label>
                <Textarea id="participantes_empresa" name="participantes_empresa" rows={9} defaultValue={linhasDe("empresa")} />
              </>
            )}
          </div>
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente || lendo}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {reuniao ? "Salvar" : `Registrar ${info.curto.toLowerCase()}`}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}
