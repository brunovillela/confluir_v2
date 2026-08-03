"use client"

import { useState } from "react"
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Info,
  Inbox,
  Plus,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/* Escalas exibidas via CSS vars — a página de referência é o único lugar
   autorizado a olhar a paleta bruta (documentação). */
const ESCALAS = [
  "primary",
  "navy",
  "neutral",
  "success",
  "warning",
  "error",
  "info",
] as const
const TONS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const

const TIPOS = [
  { classe: "text-xs", rotulo: "xs · 12px" },
  { classe: "text-sm", rotulo: "sm · 14px" },
  { classe: "text-base", rotulo: "base · 16px" },
  { classe: "text-lg", rotulo: "lg · 18px" },
  { classe: "text-xl font-medium", rotulo: "xl · 20px · 500" },
  { classe: "text-2xl font-semibold", rotulo: "2xl · 24px · 600" },
  { classe: "text-3xl font-semibold", rotulo: "3xl · 30px · 600" },
  { classe: "text-4xl font-bold", rotulo: "4xl · 36px · 700" },
  { classe: "text-5xl font-bold", rotulo: "5xl · 48px · 700" },
]

const ESPACOS = [4, 8, 12, 16, 24, 32, 48, 64]

function Secao({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-3">
      <h2 className="border-b pb-2 text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {rotulo}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function FormularioExemplo() {
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [enviado, setEnviado] = useState(false)
  const nomeInvalido = enviado && nome.trim().length < 3
  const emailInvalido = enviado && !/^\S+@\S+\.\S+$/.test(email)

  return (
    <form
      className="grid max-w-sm gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setEnviado(true)
        if (nome.trim().length >= 3 && /^\S+@\S+\.\S+$/.test(email)) {
          toast.success("Formulário válido", {
            description: "Todos os campos passaram na validação.",
          })
        }
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`sg-nome-${enviado}`}>Nome completo</Label>
        <Input
          id={`sg-nome-${enviado}`}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-invalid={nomeInvalido}
          aria-describedby={nomeInvalido ? "sg-nome-erro" : undefined}
          placeholder="Maria da Silva"
        />
        {nomeInvalido && (
          <p
            id="sg-nome-erro"
            className="text-error-fg flex items-center gap-1 text-xs"
          >
            <AlertCircle className="size-3.5" /> Informe ao menos 3 caracteres.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sg-email">E-mail</Label>
        <Input
          id="sg-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailInvalido}
          aria-describedby={emailInvalido ? "sg-email-erro" : undefined}
          placeholder="maria@exemplo.com.br"
        />
        {emailInvalido && (
          <p
            id="sg-email-erro"
            className="text-error-fg flex items-center gap-1 text-xs"
          >
            <AlertCircle className="size-3.5" /> E-mail inválido.
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit">Enviar</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setNome("")
            setEmail("")
            setEnviado(false)
          }}
        >
          Limpar
        </Button>
      </div>
    </form>
  )
}

export function StyleGuideContent() {
  const [progresso] = useState(64)

  return (
    <div className="grid gap-8">
      {/* ── Paleta ─────────────────────────────────────────────────── */}
      <Secao titulo="Paleta">
        <div className="grid gap-2">
          {ESCALAS.map((escala) => (
            <div key={escala} className="grid gap-1">
              <span className="text-muted-foreground text-xs font-medium">
                {escala}
              </span>
              <div className="flex overflow-hidden rounded-md border">
                {TONS.map((tom) => (
                  <div
                    key={tom}
                    title={`${escala}-${tom}`}
                    className="h-8 flex-1"
                    style={{ background: `var(--${escala}-${tom})` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Secao>

      {/* ── Tipografia ─────────────────────────────────────────────── */}
      <Secao titulo="Tipografia — Poppins">
        <div className="grid gap-2">
          {TIPOS.map((t) => (
            <div key={t.classe} className="flex items-baseline gap-4">
              <span className="text-muted-foreground w-28 shrink-0 text-xs tabular-nums">
                {t.rotulo}
              </span>
              <span className={`${t.classe} truncate`}>
                Confluir — gestão sindical
              </span>
            </div>
          ))}
        </div>
      </Secao>

      {/* ── Espaçamento / Raio / Elevação ──────────────────────────── */}
      <Secao titulo="Espaçamento · Raio · Elevação">
        <Linha rotulo="Escala de 4px">
          {ESPACOS.map((e) => (
            <div key={e} className="grid justify-items-center gap-1">
              <div
                className="bg-primary/20 border-primary/40 rounded-sm border"
                style={{ width: e, height: e }}
              />
              <span className="text-muted-foreground text-[10px]">{e}</span>
            </div>
          ))}
        </Linha>
        <Linha rotulo="Raio">
          {(["sm", "md", "lg", "xl"] as const).map((r) => (
            <div
              key={r}
              className="bg-muted grid size-14 place-items-center border text-xs"
              style={{ borderRadius: `var(--radius-${r})` }}
            >
              {r}
            </div>
          ))}
          <div className="bg-muted grid size-14 place-items-center rounded-full border text-xs">
            full
          </div>
        </Linha>
        <Linha rotulo="Elevação">
          {(["xs", "md", "lg", "xl"] as const).map((s) => (
            <div
              key={s}
              className="bg-card grid h-14 w-20 place-items-center rounded-lg text-xs"
              style={{ boxShadow: `var(--shadow-${s})` }}
            >
              {s}
            </div>
          ))}
        </Linha>
      </Secao>

      {/* ── Botões ─────────────────────────────────────────────────── */}
      <Secao titulo="Botões">
        <Linha rotulo="Variantes">
          <Button>Primário</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destrutivo</Button>
          <Button variant="link">Link</Button>
        </Linha>
        <Linha rotulo="Estados">
          <Button disabled>Desabilitado</Button>
          <Button disabled>
            <Spinner className="size-4" /> Carregando…
          </Button>
          <Button size="icon" aria-label="Adicionar">
            <Plus />
          </Button>
          <Button variant="outline">
            <Plus /> Com ícone
          </Button>
        </Linha>
      </Secao>

      {/* ── Badges ─────────────────────────────────────────────────── */}
      <Secao titulo="Badges / Tags">
        <Linha rotulo="Variantes">
          <Badge>Padrão</Badge>
          <Badge variant="secondary">Secundário</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="success">
            <CheckCircle2 /> Sucesso
          </Badge>
          <Badge variant="warning">
            <TriangleAlert /> Atenção
          </Badge>
          <Badge variant="error">
            <AlertCircle /> Erro
          </Badge>
          <Badge variant="info">
            <Info /> Info
          </Badge>
        </Linha>
      </Secao>

      {/* ── Alertas ────────────────────────────────────────────────── */}
      <Secao titulo="Alertas / Banner">
        <div className="grid gap-2">
          <Alert variant="success">
            <CheckCircle2 />
            <AlertTitle>Reserva confirmada</AlertTitle>
            <AlertDescription>
              O cupom foi validado e a hospedagem está garantida.
            </AlertDescription>
          </Alert>
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>Filiação aguarda fonte</AlertTitle>
            <AlertDescription>
              A fonte pagadora ainda não confirmou o desconto.
            </AlertDescription>
          </Alert>
          <Alert variant="error">
            <AlertCircle />
            <AlertTitle>Falha ao salvar</AlertTitle>
            <AlertDescription>
              Verifique os campos destacados e tente novamente.
            </AlertDescription>
          </Alert>
          <Alert variant="info">
            <Info />
            <AlertTitle>Novo módulo disponível</AlertTitle>
            <AlertDescription>
              O faturamento do hotel foi liberado para a sua conta.
            </AlertDescription>
          </Alert>
        </div>
      </Secao>

      {/* ── Formulário ─────────────────────────────────────────────── */}
      <Secao titulo="Formulário com validação">
        <FormularioExemplo />
        <Linha rotulo="Estados de input">
          <Input className="max-w-40" placeholder="Padrão" />
          <Input className="max-w-40" placeholder="Desabilitado" disabled />
          <Input
            className="max-w-40"
            defaultValue="Somente leitura"
            readOnly
          />
          <Input className="max-w-40" aria-invalid placeholder="Com erro" />
        </Linha>
        <Linha rotulo="Textarea">
          <Textarea
            className="max-w-sm"
            placeholder="Observações da reserva…"
          />
        </Linha>
        <Linha rotulo="Select">
          <Select>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Fonte pagadora" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="petrobras">Petrobras</SelectItem>
              <SelectItem value="transpetro">Transpetro</SelectItem>
              <SelectItem value="aposentado">Aposentado</SelectItem>
            </SelectContent>
          </Select>
        </Linha>
        <Linha rotulo="Seleção">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox defaultChecked /> Filiado ativo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox disabled /> Desabilitado
          </label>
          <RadioGroup defaultValue="mensal" className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="mensal" /> Mensal
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="anual" /> Anual
            </label>
          </RadioGroup>
          <label className="flex items-center gap-2 text-sm">
            <Switch defaultChecked /> Notificações
          </label>
        </Linha>
        <Linha rotulo="Slider">
          <Slider defaultValue={[40]} max={100} className="w-56" />
        </Linha>
      </Secao>

      {/* ── Sobreposição ───────────────────────────────────────────── */}
      <Secao titulo="Modal · Drawer · Menu · Tooltip · Toast">
        <Linha rotulo="Interativos">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Abrir modal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirmar exclusão</DialogTitle>
                <DialogDescription>
                  Esta ação não pode ser desfeita.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton>
                <Button variant="destructive">Excluir</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Abrir drawer</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Detalhes da reserva</SheetTitle>
                <SheetDescription>
                  Conteúdo lateral com os mesmos tokens.
                </SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Menu <ChevronRight className="rotate-90" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Ações</DropdownMenuLabel>
              <DropdownMenuItem>Editar</DropdownMenuItem>
              <DropdownMenuItem>Duplicar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">Tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>Dica contextual</TooltipContent>
          </Tooltip>
          <Button
            variant="outline"
            onClick={() =>
              toast.success("Alterações salvas", {
                description: "Os dados do filiado foram atualizados.",
              })
            }
          >
            Toast
          </Button>
        </Linha>
      </Secao>

      {/* ── Navegação ──────────────────────────────────────────────── */}
      <Secao titulo="Tabs · Accordion · Breadcrumb · Paginação">
        <Tabs defaultValue="dados">
          <TabsList>
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="vinculos">Vínculos</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>
          <TabsContent value="dados" className="text-muted-foreground text-sm">
            Conteúdo da aba de dados.
          </TabsContent>
          <TabsContent
            value="vinculos"
            className="text-muted-foreground text-sm"
          >
            Conteúdo da aba de vínculos.
          </TabsContent>
          <TabsContent
            value="historico"
            className="text-muted-foreground text-sm"
          >
            Conteúdo da aba de histórico.
          </TabsContent>
        </Tabs>
        <Accordion type="single" collapsible className="max-w-sm">
          <AccordionItem value="a">
            <AccordionTrigger>O que é o Confluir?</AccordionTrigger>
            <AccordionContent>
              Sistema de gestão organizacional do Sindipetro-NF.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="b">
            <AccordionTrigger>Como alterar o tema?</AccordionTrigger>
            <AccordionContent>
              Use o alternador no topo — claro, escuro ou sistema.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Painel</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Filiados</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Maria da Silva</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Secao>

      {/* ── Dados ──────────────────────────────────────────────────── */}
      <Secao titulo="Tabela · Progresso · Skeleton · Avatar">
        <div className="max-h-44 overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-card sticky top-0">
              <TableRow>
                <TableHead>Filiado</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Mensalidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["Maria da Silva", "success", "Ativo", "R$ 87,50"],
                ["João Souza", "warning", "Aguarda fonte", "R$ 87,50"],
                ["Ana Pereira", "success", "Ativo", "R$ 92,10"],
                ["Carlos Lima", "error", "Excluído", "—"],
              ].map(([nome, cor, situacao, valor], i) => (
                <TableRow key={nome} className={i % 2 ? "bg-muted/40" : ""}>
                  <TableCell>{nome}</TableCell>
                  <TableCell>
                    <Badge
                      variant={cor as "success" | "warning" | "error"}
                    >
                      {situacao}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {valor}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Linha rotulo="Progresso e carregamento">
          <Progress value={progresso} className="w-40" />
          <Spinner className="size-5" />
          <Skeleton className="h-5 w-32" />
          <Avatar>
            <AvatarFallback>MS</AvatarFallback>
          </Avatar>
        </Linha>
      </Secao>

      {/* ── Empty state e Card ─────────────────────────────────────── */}
      <Secao titulo="Card · Empty state">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Filiados ativos</CardTitle>
              <CardDescription>Atualizado hoje às 09h12</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">4.812</p>
              <p className="text-success-fg mt-1 flex items-center gap-1 text-xs">
                <Check className="size-3.5" /> +32 este mês
              </p>
            </CardContent>
          </Card>
          <Card className="grid place-items-center py-8 text-center">
            <div className="grid justify-items-center gap-2">
              <Inbox className="text-muted-foreground size-8" />
              <p className="text-sm font-medium">Nenhuma reserva encontrada</p>
              <p className="text-muted-foreground text-xs">
                Ajuste os filtros ou crie uma nova reserva.
              </p>
              <Button size="sm" className="mt-1">
                <Plus /> Nova reserva
              </Button>
            </div>
          </Card>
        </div>
      </Secao>
    </div>
  )
}
