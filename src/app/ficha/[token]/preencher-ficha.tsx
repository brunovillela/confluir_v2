"use client"

import { useActionState, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { consultarCep, digitosDoCep } from "@/lib/cep"
import { formatarCpf } from "@/lib/cpf"
import { formatarTelefone } from "@/lib/formato"
import { PASSOS_FICHA, SEXOS_FICHA, type DadosFicha } from "@/lib/ficha-filiacao"

import { concluirFichaAction, salvarPassoAction, type EstadoPasso } from "./actions"

const CAMPO = "h-12 text-base"
const ROTULO = "text-base"

type Inicial = {
  token: string
  caminho: "cadastro" | "outro_email" | "novo"
  passo: number
  cpf: string
  email: string
  dados: DadosFicha
  ultimoVinculo: { fonteId: string; fonte: string | null; matricula: string | null; cargo: string | null; lotacao: string | null } | null
  mesmaFonte: boolean | null
}

/** Etapas no alto: "Passo 2 de 5 · Contato e endereço", com a barra. */
export function EtapasFicha({ atual }: { atual: number }) {
  const passo = PASSOS_FICHA[atual - 1]
  return (
    <div className="mb-4 grid gap-2" aria-label={`Passo ${atual} de ${PASSOS_FICHA.length}`}>
      <p className="text-sm">
        <span className="text-muted-foreground">
          Passo {atual} de {PASSOS_FICHA.length} ·{" "}
        </span>
        <strong>{passo?.titulo}</strong>
      </p>
      <div className="flex gap-1.5" aria-hidden>
        {PASSOS_FICHA.map((p) => (
          <span key={p.numero} className={`h-1.5 flex-1 rounded-full ${p.numero <= atual ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
    </div>
  )
}

function Campo({ id, rotulo, ajuda, children }: { id: string; rotulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className={ROTULO}>
        {rotulo}
      </Label>
      {children}
      {ajuda && <p className="text-muted-foreground text-xs">{ajuda}</p>}
    </div>
  )
}

/**
 * A ficha em passos curtos. Cada "Continuar" salva no servidor — o link do
 * e-mail retoma de onde a pessoa parou. Quem já tinha cadastro vê os dados
 * preenchidos e só confere.
 */
export function PreencherFicha({
  inicial,
  fontes,
  termoDesconto,
  termoLgpd,
  ajuda,
}: {
  inicial: Inicial
  fontes: { id: string; nome: string }[]
  termoDesconto: string | null
  termoLgpd: string | null
  ajuda: ReactNode
}) {
  const [passo, setPasso] = useState(Math.min(Math.max(inicial.passo + 1, 1), 4))
  const [valores, setValores] = useState<DadosFicha>(inicial.dados)
  const [mesmaFonte, setMesmaFonte] = useState<boolean | null>(inicial.mesmaFonte)

  const [estado, salvar, salvando] = useActionState(async (prev: EstadoPasso, fd: FormData) => {
    const r = await salvarPassoAction(prev, fd)
    if (!r.erro) {
      const lido: Record<string, unknown> = {}
      for (const [k, v] of fd.entries()) if (typeof v === "string") lido[k] = v
      // A caixa do WhatsApp só existe no passo 2 (desmarcada não vai no envio).
      if (Number(fd.get("passo")) === 2) lido.telefone_1_whatsapp = fd.get("telefone_1_whatsapp") === "on"
      else delete lido.telefone_1_whatsapp
      setValores((atual) => ({ ...atual, ...(lido as DadosFicha) }))
      setPasso((p) => Math.min(p + 1, 4))
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
    return r
  }, {})
  const envio = useEnvioFormulario(salvar, estado)
  const [estadoFim, concluir, concluindo] = useActionState(concluirFichaAction, {})
  const envioFim = useEnvioFormulario(concluir, estadoFim)

  const cadastro = inicial.caminho === "cadastro"
  const v = valores
  const erroDoPasso = estado.erro && (
    <Alert variant="destructive">
      <AlertDescription>{estado.erro}</AlertDescription>
    </Alert>
  )
  const botoes = (rotulo: string) => (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      {passo > 1 ? (
        <Button type="button" variant="ghost" size="lg" onClick={() => setPasso((p) => p - 1)}>
          <ArrowLeft />
          Voltar
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" size="lg" disabled={salvando}>
        {salvando ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        {rotulo}
      </Button>
    </div>
  )

  return (
    <div>
      <EtapasFicha atual={passo} />

      {passo === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{cadastro ? "Confira os seus dados" : "Seus dados"}</CardTitle>
            <CardDescription className="text-sm">
              {cadastro
                ? "Encontramos o seu cadastro. Corrija o que estiver diferente e preencha o que faltar."
                : `CPF ${formatarCpf(inicial.cpf)} · e-mail ${inicial.email}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form key="p1" action={salvar} {...envio} className="grid gap-5">
              <input type="hidden" name="token" value={inicial.token} />
              <input type="hidden" name="passo" value="1" />
              {erroDoPasso}
              <Campo id="nome_completo" rotulo="Nome completo">
                <Input id="nome_completo" name="nome_completo" defaultValue={v.nome_completo ?? ""} required autoComplete="name" className={CAMPO} aria-invalid={estado.campo === "nome_completo"} />
              </Campo>
              <Campo id="nome_social" rotulo="Nome social (se tiver)" ajuda="Como você prefere ser chamado(a), se for diferente do nome de registro.">
                <Input id="nome_social" name="nome_social" defaultValue={v.nome_social ?? ""} className={CAMPO} />
              </Campo>
              <Campo id="nascimento" rotulo="Data de nascimento">
                <Input id="nascimento" name="nascimento" type="date" defaultValue={v.nascimento ?? ""} required className={CAMPO} aria-invalid={estado.campo === "nascimento"} />
              </Campo>
              <fieldset className="grid gap-2">
                <legend className={`${ROTULO} mb-1 font-medium`}>Sexo</legend>
                <div className="grid grid-cols-2 gap-2">
                  {SEXOS_FICHA.map((s) => (
                    <label key={s} className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-base">
                      <input type="radio" name="sexo" value={s} defaultChecked={(v.sexo ?? "") === s} required className="size-5" />
                      {s}
                    </label>
                  ))}
                </div>
              </fieldset>
              {botoes("Continuar")}
            </form>
          </CardContent>
        </Card>
      )}

      {passo === 2 && <PassoContato token={inicial.token} v={v} email={inicial.email} salvar={salvar} envio={envio} erro={erroDoPasso} campo={estado.campo} botoes={botoes("Continuar")} />}

      {passo === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Seu trabalho</CardTitle>
            <CardDescription className="text-sm">A empresa onde você trabalha hoje e a sua matrícula nela.</CardDescription>
          </CardHeader>
          <CardContent>
            <form key="p3" action={salvar} {...envio} className="grid gap-5">
              <input type="hidden" name="token" value={inicial.token} />
              <input type="hidden" name="passo" value="3" />
              {erroDoPasso}
              {inicial.ultimoVinculo && (
                <fieldset className="grid gap-2">
                  <legend className={`${ROTULO} mb-1 font-medium`}>
                    Você continua trabalhando {inicial.ultimoVinculo.fonte ? `na ${inicial.ultimoVinculo.fonte}` : "na mesma empresa"}?
                  </legend>
                  {(
                    [
                      ["sim", "Sim, continuo lá"],
                      ["nao", "Não, hoje estou em outra empresa"],
                    ] as const
                  ).map(([valor, rotulo]) => (
                    <label key={valor} className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-base">
                      <input
                        type="radio"
                        name="mesma_fonte"
                        value={valor}
                        required
                        className="size-5"
                        checked={mesmaFonte === (valor === "sim")}
                        onChange={() => setMesmaFonte(valor === "sim")}
                      />
                      {rotulo}
                    </label>
                  ))}
                </fieldset>
              )}
              {(!inicial.ultimoVinculo || mesmaFonte === false) && (
                <Campo id="empregador_id" rotulo="Empresa onde você trabalha">
                  <SelectNativo
                    id="empregador_id"
                    name="empregador_id"
                    defaultValue={v.empregador_id && v.empregador_id !== inicial.ultimoVinculo?.fonteId ? v.empregador_id : ""}
                    required
                    className={CAMPO}
                    aria-invalid={estado.campo === "empregador_id"}
                  >
                    <option value="" disabled>
                      Escolha a empresa…
                    </option>
                    {fontes.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </SelectNativo>
                </Campo>
              )}
              {(!inicial.ultimoVinculo || mesmaFonte !== null) && (
                <>
                  <Campo id="matricula" rotulo="Matrícula na empresa" ajuda="Está no contracheque ou no crachá.">
                    <Input
                      id="matricula"
                      name="matricula"
                      defaultValue={(mesmaFonte === false ? null : (v.matricula ?? inicial.ultimoVinculo?.matricula)) ?? ""}
                      key={`mat-${mesmaFonte}`}
                      required
                      className={CAMPO}
                      aria-invalid={estado.campo === "matricula"}
                    />
                  </Campo>
                  <Campo id="cargo" rotulo="Cargo (se souber)">
                    <Input id="cargo" name="cargo" key={`cargo-${mesmaFonte}`} defaultValue={(mesmaFonte === false ? null : (v.cargo ?? inicial.ultimoVinculo?.cargo)) ?? ""} className={CAMPO} />
                  </Campo>
                  <Campo id="lotacao" rotulo="Lotação ou setor (se souber)">
                    <Input id="lotacao" name="lotacao" key={`lot-${mesmaFonte}`} defaultValue={(mesmaFonte === false ? null : (v.lotacao ?? inicial.ultimoVinculo?.lotacao)) ?? ""} className={CAMPO} />
                  </Campo>
                </>
              )}
              {botoes("Continuar")}
            </form>
          </CardContent>
        </Card>
      )}

      {passo === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Autorizações</CardTitle>
            <CardDescription className="text-sm">Confira o resumo e marque as duas autorizações para concluir.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={concluir} {...envioFim} className="grid gap-5">
              <input type="hidden" name="token" value={inicial.token} />
              {estadoFim.erro && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {estadoFim.erro}{" "}
                    {estadoFim.passo && (
                      <button type="button" className="font-medium underline" onClick={() => setPasso(estadoFim.passo!)}>
                        Ir ao passo {estadoFim.passo}
                      </button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <Resumo v={v} fontes={fontes} ultimoVinculo={mesmaFonte ? inicial.ultimoVinculo : null} email={inicial.email} irPara={setPasso} />
              <label className="has-[:checked]:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-base">
                <input type="checkbox" name="aceite_desconto" required className="mt-1 size-5 shrink-0" />
                <span>{termoDesconto ?? "Autorizo o desconto da mensalidade sindical em folha de pagamento."}</span>
              </label>
              <label className="has-[:checked]:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-base">
                <input type="checkbox" name="aceite_lgpd" required className="mt-1 size-5 shrink-0" />
                <span>
                  {termoLgpd ??
                    "Autorizo o tratamento dos meus dados pessoais para os fins da filiação, conforme a Lei Geral de Proteção de Dados (LGPD)."}
                </span>
              </label>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="ghost" size="lg" onClick={() => setPasso(3)}>
                  <ArrowLeft />
                  Voltar
                </Button>
                <Button type="submit" size="lg" disabled={concluindo}>
                  {concluindo ? <Loader2 className="animate-spin" /> : <Check />}
                  Concluir e ir para a assinatura
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="mt-4">{ajuda}</div>
    </div>
  )
}

function PassoContato({
  token,
  v,
  email,
  salvar,
  envio,
  erro,
  campo,
  botoes,
}: {
  token: string
  v: DadosFicha
  email: string
  salvar: (fd: FormData) => void
  envio: ReturnType<typeof useEnvioFormulario>
  erro: ReactNode
  campo?: string
  botoes: ReactNode
}) {
  // Endereço controlado para o preenchimento pelo CEP.
  const [cep, setCep] = useState(v.endereco_cep ?? "")
  const [logradouro, setLogradouro] = useState(v.endereco_logradouro ?? "")
  const [bairro, setBairro] = useState(v.endereco_bairro ?? "")
  const [cidade, setCidade] = useState(v.endereco_cidade ?? "")
  const [uf, setUf] = useState(v.endereco_estado ?? "")
  const [buscando, setBuscando] = useState(false)
  const [avisoCep, setAvisoCep] = useState<string | null>(null)

  async function buscarCep() {
    if (digitosDoCep(cep).length !== 8) return
    setBuscando(true)
    setAvisoCep(null)
    const r = await consultarCep(cep)
    setBuscando(false)
    if (!r) return
    if (!r.ok) {
      setAvisoCep(r.motivo === "nao_encontrado" ? "CEP não encontrado: preencha o endereço abaixo." : "Não deu para consultar o CEP agora: preencha o endereço abaixo.")
      return
    }
    setLogradouro(r.endereco.logradouro)
    setBairro(r.endereco.bairro)
    setCidade(r.endereco.cidade)
    setUf(r.endereco.uf)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Contato e endereço</CardTitle>
        <CardDescription className="text-sm">O e-mail é o {email}, que você acabou de confirmar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form key="p2" action={salvar} {...envio} className="grid gap-5">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="passo" value="2" />
          {erro}
          <Campo id="telefone_1" rotulo="Celular com DDD">
            <Input id="telefone_1" name="telefone_1" inputMode="tel" autoComplete="tel" placeholder="(22) 99999-9999" defaultValue={v.telefone_1 ? formatarTelefone(v.telefone_1) : ""} required className={CAMPO} aria-invalid={campo === "telefone_1"} />
          </Campo>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input type="checkbox" name="telefone_1_whatsapp" defaultChecked={v.telefone_1_whatsapp ?? false} className="size-5" />
            Este número tem WhatsApp
          </label>
          <Campo id="telefone_2" rotulo="Outro telefone (se tiver)">
            <Input id="telefone_2" name="telefone_2" inputMode="tel" defaultValue={v.telefone_2 ?? ""} className={CAMPO} />
          </Campo>
          <Campo id="endereco_cep" rotulo="CEP" ajuda="Digite o CEP e o endereço se preenche sozinho.">
            <div className="relative">
              <Input
                id="endereco_cep"
                name="endereco_cep"
                inputMode="numeric"
                placeholder="00000-000"
                required
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                onBlur={buscarCep}
                className={CAMPO}
                aria-invalid={campo === "endereco_cep"}
              />
              {buscando && <Loader2 className="text-muted-foreground absolute top-3.5 right-3 size-5 animate-spin" />}
            </div>
            {avisoCep && <p className="text-muted-foreground text-sm">{avisoCep}</p>}
          </Campo>
          <Campo id="endereco_logradouro" rotulo="Rua">
            <Input id="endereco_logradouro" name="endereco_logradouro" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} required className={CAMPO} aria-invalid={campo === "endereco_logradouro"} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="endereco_numero" rotulo="Número">
              <Input id="endereco_numero" name="endereco_numero" defaultValue={v.endereco_numero ?? ""} required placeholder="ou s/n" className={CAMPO} aria-invalid={campo === "endereco_numero"} />
            </Campo>
            <Campo id="endereco_complemento" rotulo="Complemento">
              <Input id="endereco_complemento" name="endereco_complemento" defaultValue={v.endereco_complemento ?? ""} placeholder="apto, casa…" className={CAMPO} />
            </Campo>
          </div>
          <Campo id="endereco_bairro" rotulo="Bairro">
            <Input id="endereco_bairro" name="endereco_bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} required className={CAMPO} aria-invalid={campo === "endereco_bairro"} />
          </Campo>
          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <Campo id="endereco_cidade" rotulo="Cidade">
              <Input id="endereco_cidade" name="endereco_cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} required className={CAMPO} aria-invalid={campo === "endereco_cidade"} />
            </Campo>
            <Campo id="endereco_estado" rotulo="UF">
              <Input id="endereco_estado" name="endereco_estado" maxLength={2} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} required className={CAMPO} aria-invalid={campo === "endereco_estado"} />
            </Campo>
          </div>
          {botoes}
        </form>
      </CardContent>
    </Card>
  )
}

function Resumo({
  v,
  fontes,
  ultimoVinculo,
  email,
  irPara,
}: {
  v: DadosFicha
  fontes: { id: string; nome: string }[]
  ultimoVinculo: Inicial["ultimoVinculo"]
  email: string
  irPara: (p: number) => void
}) {
  const empresa = ultimoVinculo?.fonte ?? fontes.find((f) => f.id === v.empregador_id)?.nome ?? null
  const linhas: [string, string | null, number][] = [
    ["Nome", v.nome_completo ?? null, 1],
    ["Nascimento", v.nascimento ? v.nascimento.split("-").reverse().join("/") : null, 1],
    ["Celular", v.telefone_1 ?? null, 2],
    ["E-mail", email, 2],
    ["Endereço", [v.endereco_logradouro, v.endereco_numero, v.endereco_bairro, v.endereco_cidade].filter(Boolean).join(", ") || null, 2],
    ["Empresa", empresa, 3],
    ["Matrícula", v.matricula ?? ultimoVinculo?.matricula ?? null, 3],
  ]
  return (
    <dl className="bg-muted/40 grid gap-2 rounded-lg p-3 text-sm">
      {linhas.map(([rotulo, valor, passo]) => (
        <div key={rotulo} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">{rotulo}</dt>
            <dd className="break-words">{valor ?? "—"}</dd>
          </div>
          <button type="button" className="text-primary shrink-0 text-xs underline underline-offset-4" onClick={() => irPara(passo)}>
            Corrigir
          </button>
        </div>
      ))}
    </dl>
  )
}
