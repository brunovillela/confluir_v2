"use client"

import Link from "next/link"
import { startTransition, useActionState, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { camposQueFaltam, type ItemDoFormulario } from "@/app/portal/primeiro-acesso/regras"
import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { consultarCep, digitosDoCep, siglaDaUf, UFS } from "@/lib/cep"
import type { EstadoForm } from "@/lib/contas"
import { mascaraCep, mascaraTelefone } from "@/lib/mascaras"
import { cn } from "@/lib/utils"

import { atualizarMeuCadastro } from "./actions"
import {
  CAMPOS_TEXTO,
  camposEditaveis,
  ERRO_SEM_EMAIL,
  erroCep,
  erroEmail,
  erroTelefone,
  GRUPOS_CADASTRO,
  LIMITE_CAMPO,
  mensagemTrocaDeAcesso,
  normalizarEmail,
  soDigitos,
  trocaDoEmailDeAcesso,
  type CampoCadastro,
} from "./validacao"

export type ContatoFiliado = {
  email_pessoal: string | null
  email_corporativo: string | null
  telefone_1: string | null
  telefone_1_whatsapp: boolean | null
  telefone_2: string | null
  telefone_2_whatsapp: boolean | null
  endereco_cep: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_estado: string | null
}

type Valores = Record<CampoCadastro, string>
type Erros = Partial<Record<CampoCadastro, string>>

/**
 * Telefone como está no cadastro, com máscara. Mais de 11 dígitos (dois
 * números no mesmo campo, DDI) aparece como está: a máscara cortaria um
 * número no meio sem a pessoa ver.
 */
function telefoneInicial(v: string | null): string {
  if (!v) return ""
  return soDigitos(v).length > 11 ? v : mascaraTelefone(v)
}

function cepInicial(v: string | null): string {
  if (!v) return ""
  return digitosDoCep(v).length > 8 ? v : mascaraCep(v)
}

function valoresIniciais(c: ContatoFiliado): Valores {
  return {
    email_pessoal: c.email_pessoal ?? "",
    email_corporativo: c.email_corporativo ?? "",
    telefone_1: telefoneInicial(c.telefone_1),
    telefone_2: telefoneInicial(c.telefone_2),
    endereco_cep: cepInicial(c.endereco_cep),
    endereco_logradouro: c.endereco_logradouro ?? "",
    endereco_numero: c.endereco_numero ?? "",
    endereco_complemento: c.endereco_complemento ?? "",
    endereco_bairro: c.endereco_bairro ?? "",
    endereco_cidade: c.endereco_cidade ?? "",
    // "rj" ou "Rio de Janeiro" do cadastro migrado já chegam como "RJ".
    endereco_estado: siglaDaUf(c.endereco_estado) ?? (c.endereco_estado ?? "").trim(),
  }
}

/** Campo de texto com rótulo, erro e dica ligados ao input (A139). */
function CampoTexto({
  campo,
  rotulo,
  valor,
  aoMudar,
  erro,
  dica,
  descritoPor,
  adorno,
  className,
  children,
  exigido = false,
  "aria-invalid": invalido,
  ...props
}: {
  campo: CampoCadastro
  rotulo: React.ReactNode
  valor: string
  aoMudar: (valor: string) => void
  erro?: string
  dica?: React.ReactNode
  /** Outros ids que descrevem o campo (dica compartilhada, aviso). */
  descritoPor?: (string | null | undefined)[]
  /** Elemento sobre o input (ex.: o indicador de busca do CEP). */
  adorno?: React.ReactNode
  className?: string
  children?: React.ReactNode
  /** Primeiro acesso: precisa ficar preenchido (marca * no rótulo). */
  exigido?: boolean
} & Omit<React.ComponentProps<"input">, "id" | "name" | "value" | "onChange" | "className" | "children">) {
  const idErro = `${campo}-erro`
  const idDica = `${campo}-dica`
  const descricao = [erro ? idErro : null, dica ? idDica : null, ...(descritoPor ?? [])]
    .filter(Boolean)
    .join(" ")
  const input = (
    <Input
      id={campo}
      name={campo}
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      maxLength={LIMITE_CAMPO[campo]}
      // Campo só para consulta (travado pela entidade ou parte em pausa): o
      // fundo diz que não se edita, e o texto continua legível e copiável.
      className={props.readOnly ? "bg-muted/50" : undefined}
      {...props}
      // Inválido pelo erro do próprio campo ou pela marca de quem chama (o
      // aviso de troca do e-mail de acesso, que mora fora do campo).
      aria-invalid={erro || invalido ? true : undefined}
      aria-describedby={descricao || undefined}
      aria-required={exigido || undefined}
    />
  )
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={campo}>
        {rotulo}
        {exigido && <span aria-hidden> *</span>}
      </Label>
      {/* Com `adorno` (mesmo null) o input fica sempre dentro do mesmo
          invólucro: trocar de pai no meio da busca remontaria o campo. */}
      {adorno !== undefined ? (
        <div className="relative">
          {input}
          {adorno}
        </div>
      ) : (
        input
      )}
      {erro && (
        <p id={idErro} className="text-destructive text-xs">
          {erro}
        </p>
      )}
      {dica && (
        <p id={idDica} className="text-muted-foreground text-xs">
          {dica}
        </p>
      )}
      {children}
    </div>
  )
}

/**
 * Contato e endereço do próprio filiado (avaliação de 11/10/2026: A25, A70,
 * A130, A139).
 *
 * Os campos são controlados e o envio sai pelo `onSubmit` (preventDefault +
 * startTransition + dispatch), não pela action do <form>: o React limpa o
 * formulário ao fim de uma action de <form>, e quem tinha digitado um
 * endereço inteiro perdia tudo quando o servidor recusava um telefone. Com o
 * envio nativo cancelado, o React não chama a action nem limpa nada (o
 * `action` do <form> fica só para antes da hidratação). A conferência
 * no navegador (as mesmas regras da action, em ./validacao) mostra o erro
 * junto do campo antes mesmo de enviar.
 *
 * Área do associado: os grupos que a entidade travou (`gruposEditaveis`)
 * aparecem só para consulta, com o caminho da secretaria, e ficam fora da
 * conferência — a action também os ignora. Com a parte em pausa (`pausado`),
 * tudo fica só para consulta e o botão sai; a faixa do topo diz o motivo.
 *
 * Primeiro acesso (/portal/primeiro-acesso): o mesmo formulário, com o que
 * falta marcado (`obrigatorios`, os itens pendentes: um e-mail, um telefone,
 * o endereço completo) e conferido antes de enviar, pela mesma regra do
 * cálculo das pendências (camposQueFaltam); `voltar` leva de volta para lá
 * depois de salvar. Formato, troca do e-mail de acesso e o resto: as regras
 * de sempre, aqui e na action.
 */
export function CadastroForm({
  contato,
  somenteLeitura,
  pausado = false,
  gruposEditaveis = Object.keys(GRUPOS_CADASTRO),
  emailAcesso,
  emailConta,
  linkTrocaEmail,
  linkCorrecao,
  obrigatorios = [],
  voltar,
  rotuloSalvar = "Salvar alterações",
  nivelTitulo = 2,
  cepPrimeiro = false,
}: {
  contato: ContatoFiliado
  somenteLeitura?: boolean
  /** Meu cadastro suspenso (ou o portal em modo de consulta): nada se salva. */
  pausado?: boolean
  /** Os grupos de GRUPOS_CADASTRO que o associado pode alterar. */
  gruposEditaveis?: readonly string[]
  /** O e-mail que o login usa hoje (filiado.email). */
  emailAcesso: string | null
  /** O e-mail da conta de acesso — null na visualização da gestão. */
  emailConta: string | null
  /** Atendimento com o pedido de troca do e-mail de acesso já escolhido — null sem o Atendimento. */
  linkTrocaEmail: string | null
  /** Atendimento com o pedido de correção — null sem o Atendimento. */
  linkCorrecao: string | null
  /** Primeiro acesso: os itens que precisam ficar preenchidos para continuar. */
  obrigatorios?: readonly ItemDoFormulario[]
  /** Primeiro acesso: para onde a action volta depois de salvar (ela valida). */
  voltar?: string
  rotuloSalvar?: string
  /** Nível dos títulos "Contato" e "Endereço". Primeiro acesso: 3, abaixo do título do passo. */
  nivelTitulo?: 2 | 3
  /**
   * Endereço pelo CEP primeiro (oposição, 30/10/2026): com o endereço em
   * branco, os outros campos só abrem depois da consulta do CEP (ou do "Não
   * sei o CEP"), e a consulta sai ao completar os 8 números.
   */
  cepPrimeiro?: boolean
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoForm, FormData>(atualizarMeuCadastro, {})
  const [valores, setValores] = useState<Valores>(() => valoresIniciais(contato))
  const [whats1, setWhats1] = useState(contato.telefone_1_whatsapp === true)
  const [whats2, setWhats2] = useState(contato.telefone_2_whatsapp === true)
  const [errosCliente, setErrosCliente] = useState<Erros>({})
  // Campos mexidos depois da última resposta do servidor: o erro que ele
  // devolveu some do campo assim que a pessoa começa a corrigir.
  const [editados, setEditados] = useState<{ de: EstadoForm; campos: CampoCadastro[] }>({
    de: estado,
    campos: [],
  })
  // O aviso de troca do e-mail de acesso aparece ao sair do campo (não a cada
  // letra digitada) ou ao tentar salvar.
  const [emailsConferidos, setEmailsConferidos] = useState(false)
  const [foco, setFoco] = useState<{ campo: CampoCadastro; vez: number } | null>(null)
  const [cepStatus, setCepStatus] = useState<{ buscando: boolean; texto: string } | null>(null)
  const cepConsultado = useRef(digitosDoCep(contato.endereco_cep ?? ""))
  const consulta = useRef<AbortController | null>(null)
  const [enderecoLiberado, setEnderecoLiberado] = useState(
    () => !cepPrimeiro || Boolean(contato.endereco_logradouro?.trim())
  )

  // ── O que se altera (Área do associado) ───────────────────────────────────
  // Travado pela entidade: só consulta, com o caminho da secretaria. Em pausa,
  // tudo trava — e não há o que enviar.
  const editavel = camposEditaveis(gruposEditaveis)
  const livre = (campo: CampoCadastro) => !pausado && editavel.has(campo)
  // O resto do endereço, com o CEP primeiro: só depois da consulta.
  const livreEnd = (campo: CampoCadastro) => livre(campo) && enderecoLiberado
  const todosTravados = editavel.size === 0
  const semEnvio = pausado || todosTravados
  // Dica do campo travado pela entidade (com tudo travado, o aviso é um só, no topo).
  const travadoPelaEntidade = (campo: CampoCadastro) => !editavel.has(campo) && !todosTravados
  const comSecretaria = linkCorrecao ? (
    <Link href={linkCorrecao} className="text-primary font-medium underline underline-offset-4">
      fale com a secretaria
    </Link>
  ) : (
    "fale com a secretaria"
  )
  const notaTravado = <>Só para consulta — para mudar, {comSecretaria}.</>
  const emailsLivres = (["email_pessoal", "email_corporativo"] as const).filter(livre)

  // ── Primeiro acesso ───────────────────────────────────────────────────────
  // Os campos marcados com * (um e-mail, o telefone 1, cada parte do
  // endereço): os que faltariam com tudo em branco. Só os que se editam; o
  // e-mail marcado é o pessoal, ou o corporativo quando só ele se edita.
  const marcado = (c: string) => (c === "email_pessoal" ? (emailsLivres[0] ?? c) : c) as CampoCadastro
  const exigidos = new Set(camposQueFaltam(obrigatorios, {}).map(marcado).filter(livre))
  const exigido = (campo: CampoCadastro) => exigidos.has(campo)

  // ── E-mail de acesso (A25) ────────────────────────────────────────────────
  // Cadastro sem e-mail de quem está logado: vale o da conta (a mesma regra
  // de trocaDoEmailDeAcesso, em ./validacao).
  const emailAcessoHoje = emailAcesso ?? emailConta
  const acesso = normalizarEmail(emailAcessoHoje)
  const atualNoPessoal = !!acesso && normalizarEmail(contato.email_pessoal) === acesso
  const campoAcesso: CampoCadastro | null = !acesso
    ? null
    : atualNoPessoal
      ? "email_pessoal"
      : normalizarEmail(contato.email_corporativo) === acesso
        ? "email_corporativo"
        : null
  const conferirTroca = (pessoal: string, corporativo: string) =>
    trocaDoEmailDeAcesso({ atual: emailAcesso, emailConta, pessoal, corporativo, atualNoPessoal })
  // Com os dois e-mails travados, nada muda neles: não há troca a conferir.
  const troca = emailsLivres.length > 0 ? conferirTroca(valores.email_pessoal, valores.email_corporativo) : null
  const mensagemTroca = troca ? mensagemTrocaDeAcesso(troca) : null
  // O campo que recebe o aviso: o da troca, ou o e-mail livre quando aquele está travado.
  const campoTroca: "email_pessoal" | "email_corporativo" | null = troca
    ? livre(troca.campo)
      ? troca.campo
      : (emailsLivres[0] ?? troca.campo)
    : null
  const mostrarTroca =
    !!troca &&
    !!troca.novo &&
    emailsConferidos &&
    !erroEmail("", valores.email_pessoal) &&
    !erroEmail("", valores.email_corporativo)

  function validar(v: Valores): Erros {
    const e: Erros = {}
    // Campo travado fica fora: o valor é o do cadastro e a action não o grava
    // (um telefone antigo sem DDD não impede salvar o endereço).
    if (emailsLivres.length > 0) {
      const ep = livre("email_pessoal") ? erroEmail("O e-mail pessoal", v.email_pessoal) : null
      if (ep) e.email_pessoal = ep
      const ec = livre("email_corporativo") ? erroEmail("O e-mail corporativo", v.email_corporativo) : null
      if (ec) e.email_corporativo = ec
      // O travado conta com o valor gravado — é o que fica no cadastro.
      if (!v.email_pessoal.trim() && !v.email_corporativo.trim()) {
        e[emailsLivres[0]] = ERRO_SEM_EMAIL
      } else if (!ep && !ec && campoTroca && mensagemTroca) {
        e[campoTroca] = mensagemTroca
      }
    }
    if (livre("telefone_1")) {
      for (const [campo, rotulo] of [
        ["telefone_1", "Telefone 1"],
        ["telefone_2", "Telefone 2"],
      ] as const) {
        const erro = erroTelefone(rotulo, v[campo])
        if (erro) e[campo] = erro
      }
    }
    const ce = livre("endereco_cep") ? erroCep(v.endereco_cep) : null
    if (ce) e.endereco_cep = ce
    // Primeiro acesso: o que ainda falta, pela mesma regra das pendências.
    for (const campo of camposQueFaltam(obrigatorios, v).map(marcado)) {
      if (!exigido(campo) || e[campo]) continue
      e[campo] =
        campo === "telefone_1"
          ? "Informe ao menos um telefone para continuar."
          : campo === "endereco_estado"
            ? "Escolha a UF para continuar."
            : campo === "email_pessoal" || campo === "email_corporativo"
              ? ERRO_SEM_EMAIL
              : "Preencha este campo para continuar."
    }
    return e
  }

  // Erro do servidor: vale para o campo que ele apontou até a pessoa mexer nele.
  const campoServidor =
    estado.campo && !(editados.de === estado && editados.campos.includes(estado.campo as CampoCadastro))
      ? (estado.campo as CampoCadastro)
      : null
  function erroDe(campo: CampoCadastro): string | undefined {
    return errosCliente[campo] ?? (campoServidor === campo ? estado.erro : undefined)
  }
  const erroGeral = estado.erro && !estado.campo ? estado.erro : null

  function mudar(campo: CampoCadastro, valor: string) {
    setValores((v) => ({ ...v, [campo]: valor }))
    // Os dois e-mails se afetam (ao menos um; qual é o de acesso): mexer num
    // libera o erro dos dois.
    const liberar: CampoCadastro[] =
      campo === "email_pessoal" || campo === "email_corporativo"
        ? ["email_pessoal", "email_corporativo"]
        : [campo]
    setErrosCliente((e) => {
      if (!liberar.some((c) => e[c])) return e
      const resto = { ...e }
      for (const c of liberar) delete resto[c]
      return resto
    })
    setEditados((ed) =>
      ed.de === estado
        ? { de: estado, campos: [...new Set([...ed.campos, ...liberar])] }
        : { de: estado, campos: liberar }
    )
    if (campo === "endereco_cep") setCepStatus(null)
  }

  // Desfaz só o necessário: primeiro o campo onde mora o e-mail de acesso; o
  // outro só volta ao salvo se ainda houver troca (um e-mail pessoal novo, por
  // exemplo, passa na frente do corporativo). Mudança legítima no outro e-mail
  // não se perde.
  function manterEmailAtual() {
    const alvo = campoAcesso === "email_corporativo" ? "email_corporativo" : "email_pessoal"
    const outro = alvo === "email_pessoal" ? "email_corporativo" : "email_pessoal"
    const depois = { ...valores, [alvo]: contato[alvo] ?? "" }
    mudar(alvo, contato[alvo] ?? "")
    if (conferirTroca(depois.email_pessoal, depois.email_corporativo)) {
      mudar(outro, contato[outro] ?? "")
    }
    setFoco({ campo: alvo, vez: Date.now() })
  }

  // Leva a pessoa ao primeiro campo com erro (conferência no navegador).
  useEffect(() => {
    if (!foco) return
    const el = document.getElementById(foco.campo)
    el?.scrollIntoView({ block: "center", behavior: "smooth" })
    el?.focus({ preventScroll: true })
  }, [foco])

  // ... e ao campo que o servidor recusou.
  useEffect(() => {
    if (!estado.campo) return
    const el = document.getElementById(estado.campo)
    el?.scrollIntoView({ block: "center", behavior: "smooth" })
    el?.focus({ preventScroll: true })
  }, [estado])

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Visualização da gestão: os campos funcionam, o envio não (a action
    // também recusa quando há visualização ativa). Em pausa ou com tudo
    // travado, não há o que enviar.
    if (somenteLeitura || semEnvio || pendente) return
    const erros = validar(valores)
    setErrosCliente(erros)
    setEmailsConferidos(true)
    const primeiro = CAMPOS_TEXTO.find((c) => erros[c])
    if (primeiro) {
      // `vez` só precisa mudar a cada tentativa (o efeito do foco roda de novo).
      setFoco((f) => ({ campo: primeiro, vez: (f?.vez ?? 0) + 1 }))
      return
    }
    const dados = new FormData(e.currentTarget)
    startTransition(() => dispatch(dados))
  }

  // ── CEP → endereço (A130) ─────────────────────────────────────────────────
  // Só consulta quando o CEP MUDOU: sair do campo sem mexer não reescreve o
  // endereço. Preenche logradouro, bairro, cidade e UF com o que o ViaCEP
  // trouxer (campo vazio na resposta não apaga o que já está escrito);
  // número e complemento nunca são tocados. Funciona também na visualização
  // da gestão — não grava nada.
  async function buscarEndereco(valorCep: string = valores.endereco_cep) {
    const cep = digitosDoCep(valorCep)
    // O CEP que já estava no cadastro conta como consultado — menos com o
    // endereço ainda fechado (CEP primeiro), que só abre com a consulta.
    if (cep.length !== 8 || (cep === cepConsultado.current && enderecoLiberado)) return
    cepConsultado.current = cep
    consulta.current?.abort()
    const controle = new AbortController()
    consulta.current = controle
    const limite = window.setTimeout(() => controle.abort(), 8000)
    setCepStatus({ buscando: true, texto: "Buscando o endereço deste CEP…" })
    const r = await consultarCep(cep, { signal: controle.signal })
    window.clearTimeout(limite)
    if (consulta.current !== controle) return // outra consulta tomou o lugar
    consulta.current = null
    if (!r) {
      setCepStatus(null)
      return
    }
    setEnderecoLiberado(true)
    if (!r.ok) {
      // Falha de rede: o próximo "sair do campo" tenta de novo.
      if (r.motivo === "falha") cepConsultado.current = ""
      setCepStatus({
        buscando: false,
        texto:
          r.motivo === "nao_encontrado"
            ? "CEP não encontrado — preencha o endereço manualmente."
            : "Não foi possível consultar o CEP — preencha o endereço manualmente.",
      })
      return
    }
    const end = r.endereco
    setValores((v) => ({
      ...v,
      endereco_logradouro: end.logradouro || v.endereco_logradouro,
      endereco_bairro: end.bairro || v.endereco_bairro,
      endereco_cidade: end.cidade || v.endereco_cidade,
      endereco_estado: siglaDaUf(end.uf) ?? v.endereco_estado,
    }))
    setCepStatus({ buscando: false, texto: "Endereço preenchido pelo CEP — confira e informe o número." })
    // Quem saiu do CEP com Tab está no logradouro, que acabou de ser
    // preenchido: o próximo passo é o número.
    const ativo = document.activeElement
    if (!ativo || ativo === document.body || ativo.id === "endereco_cep" || ativo.id === "endereco_logradouro") {
      document.getElementById("endereco_numero")?.focus()
    }
  }

  // Número antigo fora do padrão (sem DDD, dois números no campo): avisa já
  // na abertura, porque a pessoa vai precisar corrigir para salvar.
  function dicaTelefone(campo: "telefone_1" | "telefone_2"): React.ReactNode {
    if (travadoPelaEntidade(campo)) return notaTravado
    const salvo = contato[campo]
    // Travado (pausa): não há o que corrigir agora.
    if (!salvo || !livre(campo) || erroDe(campo)) return undefined
    if (valores[campo] !== telefoneInicial(salvo) || !erroTelefone("x", salvo)) return undefined
    return "O número salvo no cadastro está incompleto ou fora do padrão — corrija com DDD para poder salvar."
  }

  const ufLegada = siglaDaUf(contato.endereco_estado) ? null : (contato.endereco_estado ?? "").trim() || null
  // "Escolha na lista" só para quem pode escolher.
  const ufLegadaAviso = ufLegada && livre("endereco_estado")
  const erroUf = erroDe("endereco_estado")

  // O erro de troca do e-mail de acesso é o próprio aviso abaixo dos campos.
  const erroEmailCampo = (campo: "email_pessoal" | "email_corporativo") => {
    const erro = erroDe(campo)
    return mostrarTroca && campoTroca === campo && erro === mensagemTroca ? undefined : erro
  }
  const invalidoPorTroca = (campo: CampoCadastro) =>
    mostrarTroca && campoTroca === campo && erroDe(campo) === mensagemTroca

  const rotuloEmail = (texto: string, campo: CampoCadastro) => (
    <>
      {texto}
      {campoAcesso === campo && (
        <>
          {" "}
          <span className="text-muted-foreground font-normal">(e-mail de acesso)</span>
        </>
      )}
    </>
  )

  return (
    <form
      // O `action` só vale antes da hidratação (rede lenta, JS que não
      // carregou): o envio sai por POST para a action, que confere tudo de
      // novo. Sem ele, o navegador mandaria o formulário por GET, com
      // telefone, e-mail e endereço no endereço da página. Depois de
      // hidratado, o `onSubmit` cancela o envio nativo e despacha ele mesmo —
      // assim o React não limpa os campos. Na visualização não há action e o
      // botão fica desligado (nem o Enter envia); em pausa ou com tudo
      // travado, também não.
      action={somenteLeitura || semEnvio ? undefined : dispatch}
      onSubmit={enviar}
      noValidate
      className="grid gap-4"
    >
      {voltar && <input type="hidden" name="voltar" value={voltar} />}
      {todosTravados && !pausado && (
        <Alert variant="info" role="note">
          <AlertDescription>
            <p>Os dados de contato e endereço ficam aqui para você conferir. Para mudar algum, {comSecretaria}.</p>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={nivelTitulo}>Contato</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            campo="email_pessoal"
            rotulo={rotuloEmail("E-mail pessoal", "email_pessoal")}
            exigido={exigido("email_pessoal")}
            valor={valores.email_pessoal}
            aoMudar={(v) => mudar("email_pessoal", v)}
            onBlur={() => setEmailsConferidos(true)}
            erro={erroEmailCampo("email_pessoal")}
            dica={travadoPelaEntidade("email_pessoal") ? notaTravado : undefined}
            readOnly={!livre("email_pessoal")}
            aria-invalid={invalidoPorTroca("email_pessoal") ? true : undefined}
            descritoPor={["emails-dica", mostrarTroca && campoTroca === "email_pessoal" ? "troca-acesso" : null]}
            type="email"
            inputMode="email"
            autoComplete="section-contato email"
            spellCheck={false}
            autoCapitalize="none"
          />
          <CampoTexto
            campo="email_corporativo"
            rotulo={rotuloEmail("E-mail corporativo", "email_corporativo")}
            exigido={exigido("email_corporativo")}
            valor={valores.email_corporativo}
            aoMudar={(v) => mudar("email_corporativo", v)}
            onBlur={() => setEmailsConferidos(true)}
            erro={erroEmailCampo("email_corporativo")}
            dica={travadoPelaEntidade("email_corporativo") ? notaTravado : undefined}
            readOnly={!livre("email_corporativo")}
            aria-invalid={invalidoPorTroca("email_corporativo") ? true : undefined}
            descritoPor={["emails-dica", mostrarTroca && campoTroca === "email_corporativo" ? "troca-acesso" : null]}
            type="email"
            inputMode="email"
            autoComplete="section-contato work email"
            spellCheck={false}
            autoCapitalize="none"
          />
          <p id="emails-dica" className="text-muted-foreground text-xs sm:col-span-2">
            {acesso ? (
              <>
                É no seu e-mail de acesso — hoje,{" "}
                <span className="text-foreground font-medium break-all">{emailAcessoHoje}</span> — que
                chegam o código de acesso, o link de votação e os avisos. Para trocá-lo,{" "}
                {linkTrocaEmail ? (
                  <Link href={linkTrocaEmail} className="text-primary font-medium underline underline-offset-4">
                    peça à secretaria
                  </Link>
                ) : (
                  "peça à secretaria"
                )}
                .
              </>
            ) : (
              "É no e-mail pessoal (ou, sem ele, no corporativo) que chegam o código de acesso, o link de votação e os avisos."
            )}
          </p>
          {mostrarTroca && mensagemTroca && (
            <Alert variant="warning" id="troca-acesso" className="sm:col-span-2">
              <AlertDescription className="grid gap-3">
                <span className="break-words">{mensagemTroca}</span>
                <span className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={manterEmailAtual}>
                    Manter o e-mail atual
                  </Button>
                  {linkTrocaEmail && (
                    <Button asChild variant="ghost">
                      <Link href={linkTrocaEmail}>Pedir a troca à secretaria</Link>
                    </Button>
                  )}
                </span>
              </AlertDescription>
            </Alert>
          )}

          <CampoTexto
            campo="telefone_1"
            rotulo="Telefone 1"
            exigido={exigido("telefone_1")}
            valor={valores.telefone_1}
            aoMudar={(v) => mudar("telefone_1", mascaraTelefone(v))}
            erro={erroDe("telefone_1")}
            dica={dicaTelefone("telefone_1")}
            readOnly={!livre("telefone_1")}
            type="tel"
            inputMode="tel"
            autoComplete="section-contato tel"
            placeholder="(22) 99999-9999"
          >
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="telefone_1_whatsapp"
                checked={whats1}
                onCheckedChange={(v) => setWhats1(v === true)}
                disabled={!livre("telefone_1")}
              />
              É WhatsApp
            </label>
          </CampoTexto>
          <CampoTexto
            campo="telefone_2"
            rotulo="Telefone 2"
            valor={valores.telefone_2}
            aoMudar={(v) => mudar("telefone_2", mascaraTelefone(v))}
            erro={erroDe("telefone_2")}
            dica={dicaTelefone("telefone_2")}
            readOnly={!livre("telefone_2")}
            type="tel"
            inputMode="tel"
            // Seção própria: o preenchimento automático do navegador não
            // repete o telefone 1 aqui.
            autoComplete="section-telefone-2 tel"
            placeholder="(22) 99999-9999"
          >
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="telefone_2_whatsapp"
                checked={whats2}
                onCheckedChange={(v) => setWhats2(v === true)}
                disabled={!livre("telefone_2")}
              />
              É WhatsApp
            </label>
          </CampoTexto>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={nivelTitulo}>Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {travadoPelaEntidade("endereco_cep") && (
            <p className="text-muted-foreground text-xs sm:col-span-3">
              {notaTravado}
            </p>
          )}
          <CampoTexto
            campo="endereco_cep"
            rotulo="CEP"
            exigido={exigido("endereco_cep")}
            valor={valores.endereco_cep}
            aoMudar={(v) => {
              const cep = mascaraCep(v)
              mudar("endereco_cep", cep)
              // CEP primeiro: a consulta sai ao completar os 8 números, sem esperar sair do campo.
              if (cepPrimeiro && digitosDoCep(cep).length === 8) void buscarEndereco(cep)
            }}
            // Travado, não consulta o CEP: não há o que preencher.
            onBlur={livre("endereco_cep") ? () => void buscarEndereco() : undefined}
            readOnly={!livre("endereco_cep")}
            erro={erroDe("endereco_cep")}
            descritoPor={["endereco_cep-status"]}
            inputMode="numeric"
            autoComplete="section-endereco postal-code"
            placeholder="00.000-000"
            adorno={
              cepStatus?.buscando ? (
                <Loader2
                  aria-hidden
                  className="text-muted-foreground absolute top-1/2 right-2 size-4 -translate-y-1/2 animate-spin"
                />
              ) : null
            }
          >
            {/* Região viva desde a abertura: o leitor de tela anuncia o
                resultado da busca sem tirar o foco de onde a pessoa está. */}
            <p id="endereco_cep-status" aria-live="polite" className="text-muted-foreground text-xs">
              {cepStatus?.texto ??
                (!enderecoLiberado && livre("endereco_cep")
                  ? "Comece pelo CEP: logradouro, bairro, cidade e UF são preenchidos por ele."
                  : "")}
            </p>
            {!enderecoLiberado && livre("endereco_cep") && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto justify-start px-0 text-xs"
                onClick={() => setEnderecoLiberado(true)}
              >
                Não sei o CEP — preencher à mão
              </Button>
            )}
          </CampoTexto>
          <CampoTexto
            campo="endereco_logradouro"
            rotulo="Logradouro"
            exigido={exigido("endereco_logradouro")}
            valor={valores.endereco_logradouro}
            aoMudar={(v) => mudar("endereco_logradouro", v)}
            erro={erroDe("endereco_logradouro")}
            readOnly={!livreEnd("endereco_logradouro")}
            autoComplete="section-endereco address-line1"
            className="sm:col-span-2"
          />
          <CampoTexto
            campo="endereco_numero"
            rotulo="Número"
            exigido={exigido("endereco_numero")}
            valor={valores.endereco_numero}
            aoMudar={(v) => mudar("endereco_numero", v)}
            erro={erroDe("endereco_numero")}
            readOnly={!livreEnd("endereco_numero")}
          />
          <CampoTexto
            campo="endereco_complemento"
            rotulo="Complemento"
            valor={valores.endereco_complemento}
            aoMudar={(v) => mudar("endereco_complemento", v)}
            erro={erroDe("endereco_complemento")}
            readOnly={!livreEnd("endereco_complemento")}
            autoComplete="section-endereco address-line2"
          />
          <CampoTexto
            campo="endereco_bairro"
            rotulo="Bairro"
            exigido={exigido("endereco_bairro")}
            valor={valores.endereco_bairro}
            aoMudar={(v) => mudar("endereco_bairro", v)}
            erro={erroDe("endereco_bairro")}
            readOnly={!livreEnd("endereco_bairro")}
            autoComplete="section-endereco address-level3"
          />
          <CampoTexto
            campo="endereco_cidade"
            rotulo="Cidade"
            exigido={exigido("endereco_cidade")}
            valor={valores.endereco_cidade}
            aoMudar={(v) => mudar("endereco_cidade", v)}
            erro={erroDe("endereco_cidade")}
            readOnly={!livreEnd("endereco_cidade")}
            autoComplete="section-endereco address-level2"
            className="sm:col-span-2"
          />
          <div className="grid content-start gap-1.5">
            <Label htmlFor="endereco_estado">
              UF
              {exigido("endereco_estado") && <span aria-hidden> *</span>}
            </Label>
            <SelectNativo
              id="endereco_estado"
              name="endereco_estado"
              value={valores.endereco_estado}
              onChange={(e) => mudar("endereco_estado", e.target.value)}
              // Lista não tem "só leitura": travada, fica desligada (e a
              // action ignora o campo de qualquer jeito).
              disabled={!livreEnd("endereco_estado")}
              autoComplete="section-endereco address-level1"
              aria-required={exigido("endereco_estado") || undefined}
              aria-invalid={erroUf ? true : undefined}
              aria-describedby={
                [erroUf ? "endereco_estado-erro" : null, ufLegadaAviso ? "endereco_estado-dica" : null]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            >
              <option value="">Selecione</option>
              {ufLegada && <option value={ufLegada}>{ufLegada} (como está no cadastro)</option>}
              {UFS.map((u) => (
                <option key={u.sigla} value={u.sigla}>
                  {u.sigla} — {u.nome}
                </option>
              ))}
            </SelectNativo>
            {erroUf && (
              <p id="endereco_estado-erro" className="text-destructive text-xs">
                {erroUf}
              </p>
            )}
            {ufLegadaAviso && (
              <p id="endereco_estado-dica" className="text-muted-foreground text-xs">
                A UF gravada no cadastro («{ufLegada}») não é uma das 27 — escolha na lista.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Erro sem campo (ex.: falha ao gravar) fica junto do botão: no
          celular, quem tocou em Salvar está olhando para cá. */}
      {erroGeral && (
        <Alert variant="destructive">
          <AlertDescription>{erroGeral}</AlertDescription>
        </Alert>
      )}

      {/* Em pausa, o botão sai (a faixa do topo diz o motivo); com tudo
          travado, o aviso do topo do formulário já diz o caminho. */}
      {pausado ? (
        <p className="text-muted-foreground text-sm">
          Alterações no cadastro estão em pausa no momento — veja o aviso no topo da página.
        </p>
      ) : todosTravados ? null : (
        <div className="flex justify-end">
          <AcaoVisualizacao
            preview={somenteLeitura === true}
            nota="Somente o próprio associado altera o cadastro."
          >
            <Button type="submit" disabled={pendente || somenteLeitura === true}>
              {pendente && <Loader2 className="animate-spin" />}
              {rotuloSalvar}
            </Button>
          </AcaoVisualizacao>
        </div>
      )}
    </form>
  )
}
