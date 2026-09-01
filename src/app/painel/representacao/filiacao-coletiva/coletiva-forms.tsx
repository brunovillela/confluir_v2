"use client"

import { useState } from "react"
import { useActionState } from "react"
import {
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  UsersRound,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  aplicarProcessoAction,
  criarProcessoColetivo,
  excluirProcessoAction,
  maturarAgoraAction,
  reverterProcessoAction,
} from "./actions"

const SELECT =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function NovoProcessoForm({
  rodadas,
  acordos,
}: {
  rodadas: { id: string; nome: string | null; dias: number | null; aptos: number }[]
  acordos: { id: string; titulo: string | null }[]
}) {
  const [estado, action, pend] = useActionState(criarProcessoColetivo, {})
  const [rodadaId, setRodadaId] = useState("")
  const rodada = rodadas.find((r) => r.id === rodadaId)

  if (rodadas.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Nenhuma rodada disponível. Para aparecer aqui, a rodada de assembleia
          precisa estar marcada com a <strong>cláusula de filiação coletiva</strong>{" "}
          (no cadastro da rodada) e ainda não ter processo vinculado.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={action} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="rod_assembleia_id">Rodada de assembleia *</Label>
        <select
          id="rod_assembleia_id"
          name="rod_assembleia_id"
          required
          value={rodadaId}
          onChange={(e) => setRodadaId(e.target.value)}
          className={SELECT}
        >
          <option value="" disabled>
            Rodadas com cláusula de filiação coletiva…
          </option>
          {rodadas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome ?? "(sem nome)"} — {r.aptos} apto
              {r.aptos === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Título do processo *</Label>
        <Input
          id="titulo"
          name="titulo"
          required
          placeholder="Ex.: Filiação coletiva — ACT 2026/2027"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="dias_desistencia">
            Prazo de desistência (dias corridos) *
          </Label>
          <Input
            id="dias_desistencia"
            name="dias_desistencia"
            inputMode="numeric"
            required
            key={rodada?.dias ?? "vazio"}
            defaultValue={rodada?.dias ?? ""}
            placeholder="Ex.: 30"
          />
          <p className="text-muted-foreground text-xs">
            Sugerido pelo cadastro da rodada — ajuste se o ACT previr outro.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acordo_id">Acordo coletivo (opcional)</Label>
          <select id="acordo_id" name="acordo_id" defaultValue="" className={SELECT}>
            <option value="">— não vincular —</option>
            {acordos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.titulo ?? "(sem título)"}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea id="observacoes" name="observacoes" rows={2} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pend}>
          {pend ? <Loader2 className="animate-spin" /> : <UsersRound />}
          Criar e conciliar
        </Button>
      </div>
    </form>
  )
}

type Duvida = {
  aptoId: string
  nome: string | null
  cpf: string | null
  candidatos: { id: string; nome: string | null; cpf: string | null; condicao: string | null }[]
}

/** Aplicação do lote: exige digitar APLICAR (ação de massa). */
export function AplicarProcesso({
  id,
  duvidas,
  resumo,
}: {
  id: string
  duvidas: Duvida[]
  resumo: { total: number; mantidos: number; aCriar: number; aRecarimbar: number; duvidas: number }
}) {
  const [estado, action, pend] = useActionState(aplicarProcessoAction, {})
  // decisões controladas para o "aplicar a todas" conseguir mexer nos selects
  const [decisoes, setDecisoes] = useState<Record<string, string>>(() =>
    Object.fromEntries(duvidas.map((d) => [d.aptoId, "ignorar"]))
  )
  const [emMassa, setEmMassa] = useState("ignorar")
  const [avisoMassa, setAvisoMassa] = useState<string | null>(null)

  const comCandidatoUnico = duvidas.filter((d) => d.candidatos.length === 1)

  function aplicarATodas() {
    const novas = { ...decisoes }
    let alteradas = 0
    let pulou = 0
    for (const d of duvidas) {
      if (emMassa === "candidato_unico") {
        // só onde NÃO há ambiguidade: 1 candidato apenas
        if (d.candidatos.length === 1) {
          novas[d.aptoId] = d.candidatos[0].id
          alteradas++
        } else {
          pulou++
        }
      } else {
        novas[d.aptoId] = emMassa
        alteradas++
      }
    }
    setDecisoes(novas)
    setAvisoMassa(
      `${alteradas} dúvida${alteradas === 1 ? "" : "s"} definida${alteradas === 1 ? "" : "s"}` +
        (pulou > 0
          ? pulou === 1
            ? " · 1 ficou como estava por ter mais de um candidato — resolva essa à mão."
            : ` · ${pulou} ficaram como estavam por terem mais de um candidato — resolva essas à mão.`
          : ". Revise abaixo antes de aplicar.")
    )
  }

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
      <input type="hidden" name="id" value={id} />

      {duvidas.length > 0 && (
        <div className="grid gap-3">
          <p className="text-sm font-medium">
            Resolva as {duvidas.length} dúvida{duvidas.length === 1 ? "" : "s"}
          </p>
          <p className="text-muted-foreground text-xs">
            Estes aptos casaram apenas pelo nome — o sistema não filia por nome
            sozinho, porque homônimo é comum. Escolha o cadastro certo, mande
            criar um novo ou ignore.
          </p>

          {/* Decisão em massa — para listas grandes, onde resolver uma a uma
              é inviável. Continua sendo só uma pré-seleção: nada é gravado
              antes de digitar APLICAR. */}
          <div className="bg-muted/40 grid gap-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Aplicar a mesma decisão a todas</p>
            <div className="flex flex-wrap items-end gap-2">
              <select
                value={emMassa}
                onChange={(e) => setEmMassa(e.target.value)}
                className={`${SELECT} sm:max-w-xs`}
                aria-label="Decisão para todas as dúvidas"
              >
                <option value="ignorar">Ignorar todas (não filiar agora)</option>
                <option value="criar">Criar cadastro novo para todas</option>
                <option value="candidato_unico">
                  Casar com o cadastro sugerido — só onde há 1 candidato (
                  {comCandidatoUnico.length})
                </option>
              </select>
              <Button type="button" variant="secondary" onClick={aplicarATodas}>
                <ListChecks className="size-4" />
                Aplicar às {duvidas.length}
              </Button>
            </div>
            {emMassa === "candidato_unico" && (
              <p className="text-warning-fg text-xs">
                Atenção: casar em massa aceita a sugestão do sistema sem
                conferência individual. Use só quando a lista de aptos vier da
                mesma base do cadastro; na dúvida, prefira ignorar e resolver
                caso a caso.
              </p>
            )}
            {avisoMassa && (
              <p className="text-muted-foreground text-xs">{avisoMassa}</p>
            )}
          </div>

          <ul className="divide-y rounded-lg border">
            {duvidas.map((d) => (
              <li key={d.aptoId} className="grid gap-2 px-3 py-2 sm:grid-cols-2">
                <div className="text-sm">
                  <p className="font-medium">{d.nome ?? "(sem nome)"}</p>
                  <p className="text-muted-foreground text-xs">
                    {d.cpf ? `CPF ${d.cpf}` : "sem CPF na lista de aptos"}
                    {d.candidatos.length > 1 && (
                      <span className="text-warning-fg">
                        {" "}
                        · {d.candidatos.length} candidatos
                      </span>
                    )}
                  </p>
                </div>
                <select
                  name={`duvida_${d.aptoId}`}
                  value={decisoes[d.aptoId] ?? "ignorar"}
                  onChange={(e) =>
                    setDecisoes((v) => ({ ...v, [d.aptoId]: e.target.value }))
                  }
                  className={SELECT}
                >
                  <option value="ignorar">Ignorar (não filiar agora)</option>
                  <option value="criar">Criar cadastro novo</option>
                  {d.candidatos.map((c) => (
                    <option key={c.id} value={c.id}>
                      É {c.nome ?? "(sem nome)"}
                      {c.cpf ? ` — CPF ${c.cpf}` : ""}
                      {c.condicao ? ` (${c.condicao})` : ""}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="confirmacao">
            Digite APLICAR para confirmar
          </Label>
          <Input
            id="confirmacao"
            name="confirmacao"
            placeholder="APLICAR"
            className="w-40"
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={pend}>
          {pend ? <Loader2 className="animate-spin" /> : <Play className="size-4" />}
          Aplicar processo ({resumo.aCriar + resumo.aRecarimbar}{" "}
          {resumo.aCriar + resumo.aRecarimbar === 1 ? "alteração" : "alterações"})
        </Button>
      </div>
    </form>
  )
}

/** Reversão: digitar REVERTER + senha do usuário (confirmação forte). */
export function ReverterProcesso({ id }: { id: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, action, pend] = useActionState(reverterProcessoAction, {})

  if (!aberto) {
    return (
      <Button variant="outline" onClick={() => setAberto(true)}>
        <RotateCcw className="size-4" />
        Reverter processo
      </Button>
    )
  }
  return (
    <form action={action} className="grid max-w-md gap-3">
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
      <input type="hidden" name="id" value={id} />
      <Alert variant="destructive">
        <AlertDescription>
          A reversão desfaz o lote inteiro: as filiações criadas são excluídas e
          as que existiam voltam à condição anterior. Não há como refazer o
          processamento depois.
        </AlertDescription>
      </Alert>
      <div className="grid gap-1.5">
        <Label htmlFor="confirmacao_rev">Digite REVERTER</Label>
        <Input
          id="confirmacao_rev"
          name="confirmacao"
          placeholder="REVERTER"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="senha">Sua senha de acesso</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
        />
        <p className="text-muted-foreground text-xs">
          Confirmação de segurança — a senha só valida quem você é, não fica
          guardada.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pend}>
          {pend ? <Loader2 className="animate-spin" /> : <RotateCcw className="size-4" />}
          Confirmar reversão
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

export function ExcluirProcesso({ id }: { id: string }) {
  const [estado, action, pend] = useActionState(excluirProcessoAction, {})
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Excluir este rascunho de filiação coletiva?")) {
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
        Excluir rascunho
      </Button>
    </form>
  )
}

export function BotaoMaturarAgora() {
  const [estado, action, pend] = useActionState(maturarAgoraAction, {})
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
        <Button type="submit" variant="outline" size="sm" disabled={pend}>
          {pend ? <Loader2 className="animate-spin" /> : <Play className="size-3.5" />}
          Processar prazos agora
        </Button>
      </form>
    </div>
  )
}
