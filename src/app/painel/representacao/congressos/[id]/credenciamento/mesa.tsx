"use client"

import { useRef, useState, useTransition } from "react"
import { CheckCircle2, Loader2, Printer, Search } from "lucide-react"

import { LeitorQr } from "@/components/leitor-qr"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import type { PessoaMesa } from "@/lib/db/congressos-dia"

import {
  buscarMesaAction,
  credenciarAction,
  desfazerCredenciamentoAction,
  segundaViaAction,
  substituirAction,
} from "../../dia-actions"

type Titular = { id: string; nome: string; base: string | null; credenciado: boolean }

/** Abre o PDF do crachá numa aba e chama a impressão. */
function imprimir(pdfBase64: string) {
  const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
  const janela = window.open(url, "_blank")
  if (janela) janela.addEventListener("load", () => janela.print(), { once: true })
}

export function Mesa({
  congressoId,
  exigeDocumento,
  permiteDistancia,
  autorizacao,
  titulares,
  segundaViaProibida,
}: {
  congressoId: string
  exigeDocumento: boolean
  permiteDistancia: boolean
  autorizacao: string | null
  titulares: Titular[]
  segundaViaProibida: boolean
}) {
  const [termo, setTermo] = useState("")
  const [pessoas, setPessoas] = useState<PessoaMesa[]>([])
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const busca = useRef<HTMLInputElement>(null)

  function buscar(valor: string) {
    if (valor.trim().length < 3) return
    iniciar(async () => {
      const r = await buscarMesaAction({ congressoId, termo: valor })
      if (r.erro) return setAviso({ tipo: "erro", texto: r.erro })
      setPessoas(r.pessoas ?? [])
      setAviso(r.aviso ? { tipo: "info", texto: r.aviso } : (r.pessoas ?? []).length ? null : { tipo: "info", texto: "Ninguém encontrado." })
    })
  }

  function pronto(texto: string) {
    setAviso({ tipo: "ok", texto })
    setPessoas([])
    setTermo("")
    busca.current?.focus()
  }

  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          buscar(termo)
        }}
      >
        <div className="grid min-w-64 flex-1 gap-1.5">
          <Label htmlFor="busca">Nome, CPF ou QR</Label>
          <Input
            id="busca"
            ref={busca}
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Digite e tecle Enter, ou leia o QR"
            className="h-11 text-base"
          />
        </div>
        <Button type="submit" className="h-11" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Search />}
          Buscar
        </Button>
      </form>
      <LeitorQr
        rotulo="Ler QR do crachá ou do celular"
        aoLer={(t) => {
          setTermo(t)
          buscar(t)
        }}
      />
      {aviso && (
        <Alert variant={aviso.tipo === "erro" ? "destructive" : "default"}>
          <AlertDescription className={aviso.tipo === "ok" ? "text-emerald-700 dark:text-emerald-400" : undefined}>
            {aviso.texto}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3">
        {pessoas.map((p) => (
          <CartaoPessoa
            key={p.id}
            p={p}
            congressoId={congressoId}
            exigeDocumento={exigeDocumento}
            permiteDistancia={permiteDistancia}
            autorizacao={autorizacao}
            titulares={titulares}
            segundaViaProibida={segundaViaProibida}
            aoConcluir={pronto}
            aoErro={(t) => setAviso({ tipo: "erro", texto: t })}
          />
        ))}
      </div>
    </div>
  )
}

function CartaoPessoa({
  p,
  congressoId,
  exigeDocumento,
  permiteDistancia,
  autorizacao,
  titulares,
  segundaViaProibida,
  aoConcluir,
  aoErro,
}: {
  p: PessoaMesa
  congressoId: string
  exigeDocumento: boolean
  permiteDistancia: boolean
  autorizacao: string | null
  titulares: Titular[]
  segundaViaProibida: boolean
  aoConcluir: (t: string) => void
  aoErro: (t: string) => void
}) {
  const [documento, setDocumento] = useState(false)
  const [modalidade, setModalidade] = useState<"presencial" | "distancia">("presencial")
  const [justificativa, setJustificativa] = useState("")
  const [titularId, setTitularId] = useState("")
  const [autorizadoPor, setAutorizadoPor] = useState("")
  const [pendente, iniciar] = useTransition()
  const foraDoPrazo = p.avisos.some((a) => /prazo/.test(a))
  const podeCredenciar = !p.credenciadoEm && p.situacao === "confirmado"
  const opcoesTitular = titulares.filter((t) => t.base === p.base && t.id !== p.id)

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">{p.nome}</div>
          {p.nome !== p.nomeCivil && <div className="text-muted-foreground text-xs">Nome civil: {p.nomeCivil}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {p.papel && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-full" style={{ background: p.cor ?? "transparent" }} />
                {p.papel}
              </span>
            )}
            {p.base && <span className="text-muted-foreground">· {p.base}</span>}
            {p.grupo && <span className="text-muted-foreground">· {p.grupo}</span>}
            {p.cpf && <span className="text-muted-foreground">· CPF final {p.cpf.slice(-4, -2)}-{p.cpf.slice(-2)}</span>}
          </div>
        </div>
        {p.credenciadoEm ? (
          <Badge variant="success">
            <CheckCircle2 className="size-3.5" />
            Credenciado
          </Badge>
        ) : (
          <Badge variant="secondary">Não credenciado</Badge>
        )}
      </div>
      {p.substituiu && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Assumiu a vaga de {p.substituiu}.</p>}
      {p.acessibilidade && <p className="text-sm">Acessibilidade: {p.acessibilidade}</p>}
      {p.avisos.length > 0 && (
        <ul className="grid gap-1 text-sm text-amber-700 dark:text-amber-400">
          {p.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {podeCredenciar && (
        <div className="grid gap-3">
          {exigeDocumento && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={documento} onChange={(e) => setDocumento(e.target.checked)} className="accent-primary size-5" />
              Documento com foto conferido
            </label>
          )}
          {permiteDistancia && (
            <div className="grid max-w-xs gap-1.5">
              <Label>Participa</Label>
              <SelectNativo value={modalidade} onChange={(e) => setModalidade(e.target.value as "presencial" | "distancia")}>
                <option value="presencial">No local</option>
                <option value="distancia">A distância</option>
              </SelectNativo>
            </div>
          )}
          {foraDoPrazo && (
            <div className="grid gap-1.5">
              <Label>Justificativa (fora do prazo)</Label>
              <Input value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
            </div>
          )}
          <Button
            className="h-12 justify-self-start text-base"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await credenciarAction({ congressoId, participanteId: p.id, documento, modalidade, justificativa: justificativa || null })
                if (r.erro) return aoErro(r.erro)
                if (r.pdf) imprimir(r.pdf)
                aoConcluir(
                  r.pdf
                    ? `${p.nome} credenciado(a). Crachá enviado para impressão.`
                    : r.jaTinhaCracha
                      ? `${p.nome} credenciado(a). Entregue o crachá pré-impresso.`
                      : `${p.nome} credenciado(a) a distância.`
                )
              })
            }
          >
            {pendente ? <Loader2 className="animate-spin" /> : <Printer />}
            Credenciar{modalidade === "presencial" ? " e imprimir crachá" : ""}
          </Button>
        </div>
      )}

      {p.credenciadoEm && (
        <div className="flex flex-wrap gap-2">
          {p.modalidade === "presencial" && !segundaViaProibida && (
            <Button
              variant="outline"
              size="sm"
              disabled={pendente}
              onClick={() => {
                const motivo = window.prompt("Motivo da segunda via (o crachá anterior deixa de valer):", "Perda")
                if (!motivo) return
                iniciar(async () => {
                  const r = await segundaViaAction({ congressoId, participanteId: p.id, motivo })
                  if (r.erro) return aoErro(r.erro)
                  if (r.pdf) imprimir(r.pdf)
                  aoConcluir(`Segunda via de ${p.nome} enviada para impressão.`)
                })
              }}
            >
              Segunda via do crachá
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={() => {
              const motivo = window.prompt("Motivo para desfazer o credenciamento:")
              if (!motivo) return
              iniciar(async () => {
                const r = await desfazerCredenciamentoAction({ congressoId, participanteId: p.id, motivo })
                if (r.erro) return aoErro(r.erro)
                aoConcluir(`Credenciamento de ${p.nome} desfeito.`)
              })
            }}
          >
            Desfazer credenciamento
          </Button>
        </div>
      )}

      {p.categoria === "suplente" && !p.substituiu && p.situacao !== "cancelado" && (
        <div className="grid gap-2 rounded-md border border-dashed p-3">
          <div className="text-sm font-medium">Assumir no lugar de um titular</div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-56 gap-1">
              <Label className="text-xs">Titular</Label>
              <SelectNativo value={titularId} onChange={(e) => setTitularId(e.target.value)}>
                <option value="">Escolha…</option>
                {opcoesTitular.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                    {t.credenciado ? " (credenciado)" : " (ausente)"}
                  </option>
                ))}
              </SelectNativo>
            </div>
            {autorizacao && (
              <div className="grid min-w-56 gap-1">
                <Label className="text-xs">Autorizado por ({autorizacao})</Label>
                <Input value={autorizadoPor} onChange={(e) => setAutorizadoPor(e.target.value)} />
              </div>
            )}
            <Button
              variant="outline"
              disabled={pendente || !titularId}
              onClick={() =>
                iniciar(async () => {
                  const r = await substituirAction({ congressoId, titularId, suplenteId: p.id, autorizadoPor: autorizadoPor || null, motivo: null })
                  if (r.erro) return aoErro(r.erro)
                  aoConcluir(`${p.nome} assumiu a vaga. ${p.credenciadoEm ? "" : "Credencie agora."}`)
                })
              }
            >
              Registrar a troca
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
