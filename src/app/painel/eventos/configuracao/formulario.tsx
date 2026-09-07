"use client"

import { useActionState, useState } from "react"
import { Loader2, Save, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  MODOS_FOTO,
  type ConfigEventos,
  type ModoFoto,
} from "@/lib/eventos-constantes"

import { salvarConfigAction } from "./actions"

export function ConfiguracaoForm({
  config,
  fotosGuardadas,
}: {
  config: ConfigEventos
  fotosGuardadas: number
}) {
  const [estado, formAction, pendente] = useActionState(salvarConfigAction, {})
  const [modo, setModo] = useState<ModoFoto>(config.modo_foto)

  const escolhido = MODOS_FOTO.find((m) => m.valor === modo)
  const virandoBiometrica =
    modo === "biometrica" && config.modo_foto !== "biometrica"
  const baixandoRegime =
    config.modo_foto === "biometrica" && modo !== "biometrica"

  return (
    <form action={formAction} className="grid gap-6">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3">
        <Label>O que fazemos com a foto de quem se inscreve</Label>
        {MODOS_FOTO.map((m) => (
          <label
            key={m.valor}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <input
              type="radio"
              name="modo_foto"
              value={m.valor}
              className="mt-1 size-4"
              checked={modo === m.valor}
              onChange={() => setModo(m.valor)}
            />
            <span className="text-sm">
              {m.rotulo}
              <span className="text-muted-foreground block text-xs">
                {m.regime}
              </span>
            </span>
          </label>
        ))}
        <p className="text-muted-foreground text-xs">
          Vale para toda a entidade. Cada evento pode pedir menos que isto —
          nunca mais.
        </p>
      </div>

      {virandoBiometrica && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription className="grid gap-2">
            <span>
              Reconhecimento facial trata <strong>dado sensível</strong>. Isso
              muda o que a entidade precisa sustentar: consentimento específico
              e destacado para essa finalidade, a possibilidade real de a pessoa
              não consentir, prazo de guarda declarado e um caminho de exclusão
              que alcance também o sistema da catraca.
            </span>
            <span>
              O termo que a pessoa vai assinar já está cadastrado e diz que a
              recusa <strong>inviabiliza a inscrição</strong> no evento — porque
              é isso que acontece quando a foto é exigida.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {baixandoRegime && fotosGuardadas > 0 && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            Há <strong>{fotosGuardadas} foto(s) guardada(s)</strong> coletadas
            sob o regime biométrico. Mudar a configuração daqui para a frente
            não apaga nem reclassifica o que já foi coletado — quem consentiu
            com o uso na catraca continua tendo direito à remoção lá.
          </AlertDescription>
        </Alert>
      )}

      {modo === "biometrica" && (
        <label className="flex items-start gap-3 rounded-md border p-3">
          <input
            type="checkbox"
            name="ciente_sensivel"
            className="mt-0.5 size-4"
          />
          <span className="text-sm">
            A entidade assume o tratamento de dado biométrico
            <span className="text-muted-foreground block text-xs">
              Confirmação exigida para ligar o reconhecimento facial. Fica
              registrado quem salvou e quando.
            </span>
          </span>
        </label>
      )}

      {modo !== "nenhuma" && (
        <>
          <div className="grid gap-2 sm:max-w-xl">
            <Label htmlFor="retencao_foto_dias">
              Apagar a foto depois de quantos dias
            </Label>
            <Input
              id="retencao_foto_dias"
              name="retencao_foto_dias"
              type="number"
              min={1}
              max={3650}
              defaultValue={config.retencao_foto_dias}
              className="sm:max-w-40"
            />
            <p className="text-muted-foreground text-xs">
              Contados a partir do fim do evento. O prazo aparece no termo, e
              prometer um prazo é assumir cumpri-lo.
            </p>
          </div>

          <div className="grid gap-2 sm:max-w-xl">
            <Label htmlFor="controle_acesso_nome">
              Nome do sistema de controle de acesso
            </Label>
            <Input
              id="controle_acesso_nome"
              name="controle_acesso_nome"
              defaultValue={config.controle_acesso_nome ?? ""}
              placeholder="Hit-Conect, por exemplo"
              className="sm:max-w-96"
            />
            <p className="text-muted-foreground text-xs">
              Aparece no termo e na pendência de remoção. Sem nome, a pessoa lê
              &quot;seu rosto vai para um sistema&quot; sem saber qual.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-md border p-3">
            <input
              type="checkbox"
              name="controle_acesso_exclusao_manual"
              className="mt-0.5 size-4"
              defaultChecked={config.controle_acesso_exclusao_manual}
            />
            <span className="text-sm">
              A remoção no controle de acesso é feita à mão
              <span className="text-muted-foreground block text-xs">
                Enquanto não houver integração, todo pedido de exclusão vira uma
                pendência para alguém executar no outro sistema — e ela só sai
                da lista quando alguém confirma que executou. Desmarque apenas
                quando existir integração de verdade: desmarcar sem ela faz o
                sistema prometer uma remoção que ninguém vai fazer.
              </span>
            </span>
          </label>
        </>
      )}

      {escolhido && modo === "nenhuma" && (
        <p className="text-muted-foreground text-sm">
          Sem foto, a recepção identifica por nome, CPF ou QR Code.
        </p>
      )}

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar configuração
        </Button>
      </div>
    </form>
  )
}
