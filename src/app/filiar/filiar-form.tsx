"use client"

import { useActionState, useState } from "react"
import { Loader2, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { limparCpf, mascararCpfParcial, validarCpf } from "@/lib/cpf"

import { solicitarFiliacaoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function Secao({ titulo }: { titulo: string }) {
  return (
    <h2 className="text-primary text-xs font-semibold tracking-wide uppercase">
      {titulo}
    </h2>
  )
}

export function FiliarForm({
  fontes,
  termoLgpd,
  termoDesconto,
}: {
  fontes: { id: string; nome: string }[]
  termoLgpd: string | null
  termoDesconto: string | null
}) {
  const [estado, formAction, pendente] = useActionState(
    solicitarFiliacaoAction,
    {}
  )

  const [cpf, setCpf] = useState("")
  const cpfDigitos = limparCpf(cpf).length
  const cpfInvalido = cpfDigitos === 11 && !validarCpf(cpf)
  const cpfBloqueia = cpfDigitos > 0 && !validarCpf(cpf)

  // Aceites legais obrigatórios para avançar.
  const [aceiteDesconto, setAceiteDesconto] = useState(false)
  const [aceiteLgpd, setAceiteLgpd] = useState(false)

  // Endereço controlado para o preenchimento automático pelo CEP (Correios).
  const [cep, setCep] = useState("")
  const [logradouro, setLogradouro] = useState("")
  const [bairro, setBairro] = useState("")
  const [cidade, setCidade] = useState("")
  const [uf, setUf] = useState("")
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCep, setErroCep] = useState<string | null>(null)

  async function buscarCep() {
    const digitos = cep.replace(/\D/g, "")
    if (digitos.length !== 8) return
    setBuscandoCep(true)
    setErroCep(null)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
      const d = await r.json()
      if (d?.erro) {
        setErroCep("CEP não encontrado — preencha o endereço manualmente.")
        return
      }
      setLogradouro(d.logradouro ?? "")
      setBairro(d.bairro ?? "")
      setCidade(d.localidade ?? "")
      setUf(d.uf ?? "")
    } catch {
      setErroCep("Não foi possível consultar o CEP — preencha manualmente.")
    } finally {
      setBuscandoCep(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Seus dados</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}

          <Secao titulo="Dados pessoais" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="nome_completo">Nome completo *</Label>
              <Input id="nome_completo" name="nome_completo" required />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="nome_social">Nome social (opcional)</Label>
              <Input id="nome_social" name="nome_social" />
              <p className="text-muted-foreground text-xs">
                Como você prefere ser chamado(a), se for diferente do nome de
                registro.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cpf">CPF *</Label>
              <Input
                id="cpf"
                name="cpf"
                inputMode="numeric"
                placeholder="000.000.000-00"
                required
                value={cpf}
                onChange={(e) => setCpf(mascararCpfParcial(e.target.value))}
                aria-invalid={cpfInvalido}
                className={cpfInvalido ? "border-destructive" : undefined}
              />
              {cpfInvalido && (
                <p className="text-destructive text-xs">
                  CPF inválido — confira os dígitos.
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nascimento">Data de nascimento</Label>
              <Input id="nascimento" name="nascimento" type="date" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sexo">Sexo</Label>
              <select id="sexo" name="sexo" defaultValue="" className={SELECT}>
                <option value="">Prefiro não informar</option>
                <option value="Masculino">Masculino</option>
                <option value="Feminino">Feminino</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
          </div>

          <Secao titulo="Contato" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input id="email" name="email" type="email" required />
              <p className="text-muted-foreground text-xs">
                Enviaremos um código de confirmação para este e-mail.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="telefone_1">Telefone principal</Label>
              <Input id="telefone_1" name="telefone_1" inputMode="tel" />
              <label className="text-muted-foreground flex items-center gap-2 text-xs">
                <input type="checkbox" name="telefone_1_whatsapp" className="size-4" />
                É WhatsApp
              </label>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="telefone_2">Telefone alternativo</Label>
              <Input id="telefone_2" name="telefone_2" inputMode="tel" />
            </div>
          </div>

          <Secao titulo="Endereço" />
          <div className="grid gap-4 sm:grid-cols-6">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="endereco_cep">CEP</Label>
              <div className="relative">
                <Input
                  id="endereco_cep"
                  name="endereco_cep"
                  inputMode="numeric"
                  placeholder="00000-000"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  onBlur={buscarCep}
                />
                {buscandoCep && (
                  <Loader2 className="text-muted-foreground absolute top-2.5 right-2 size-4 animate-spin" />
                )}
              </div>
              {erroCep && <p className="text-muted-foreground text-xs">{erroCep}</p>}
            </div>
            <div className="grid gap-1.5 sm:col-span-3">
              <Label htmlFor="endereco_logradouro">Logradouro</Label>
              <Input
                id="endereco_logradouro"
                name="endereco_logradouro"
                value={logradouro}
                onChange={(e) => setLogradouro(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-1">
              <Label htmlFor="endereco_numero">Número</Label>
              <Input id="endereco_numero" name="endereco_numero" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="endereco_complemento">Complemento</Label>
              <Input id="endereco_complemento" name="endereco_complemento" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="endereco_bairro">Bairro</Label>
              <Input
                id="endereco_bairro"
                name="endereco_bairro"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-1">
              <Label htmlFor="endereco_cidade">Cidade</Label>
              <Input
                id="endereco_cidade"
                name="endereco_cidade"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-1">
              <Label htmlFor="endereco_estado">UF</Label>
              <Input
                id="endereco_estado"
                name="endereco_estado"
                maxLength={2}
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <Secao titulo="Vínculo empregatício" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="empregador_id">Empregador (fonte pagadora)</Label>
              <select id="empregador_id" name="empregador_id" defaultValue="" className={SELECT}>
                <option value="">Selecione o seu empregador</option>
                {fontes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="matricula">Matrícula</Label>
              <Input id="matricula" name="matricula" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cargo">Cargo</Label>
              <Input id="cargo" name="cargo" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="lotacao">Lotação</Label>
              <Input id="lotacao" name="lotacao" />
            </div>
          </div>

          <Secao titulo="Autorizações" />
          <div className="grid gap-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="aceite_desconto"
                className="mt-0.5 size-4"
                required
                checked={aceiteDesconto}
                onChange={(e) => setAceiteDesconto(e.target.checked)}
              />
              <span>
                {termoDesconto ??
                  "Autorizo o desconto da mensalidade sindical em folha de pagamento."}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="aceite_lgpd"
                className="mt-0.5 size-4"
                required
                checked={aceiteLgpd}
                onChange={(e) => setAceiteLgpd(e.target.checked)}
              />
              <span>
                {termoLgpd ??
                  "Autorizo o tratamento dos meus dados pessoais para os fins da filiação, conforme a Lei Geral de Proteção de Dados (LGPD)."}
              </span>
            </label>
          </div>

          <div className="flex flex-col items-end gap-1">
            {(!aceiteDesconto || !aceiteLgpd) && (
              <p className="text-muted-foreground text-xs">
                Marque as duas autorizações para continuar.
              </p>
            )}
            <Button
              type="submit"
              disabled={pendente || cpfBloqueia || !aceiteDesconto || !aceiteLgpd}
            >
              {pendente ? <Loader2 className="animate-spin" /> : <Send />}
              Enviar e receber o código
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
