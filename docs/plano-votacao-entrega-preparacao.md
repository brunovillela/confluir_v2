# Plano — entrega do voto quando o e-mail corporativo não chega (21/10/2026)

## Ponto de partida

Assembleia da Halliburton (Terceira rodada, 21–22/10, 2.182 aptos, todos @halliburton.com).
As reclamações foram de **dificuldade de acesso por não receber e-mails**.

| | SLB 14/10 | Wellbore 20/10 | Halliburton 21/10 |
|---|---|---|---|
| Aptos | 1.573 | 67 | 2.182 |
| Link pessoal enviado antes da abertura | todos | todos | todos (20/10, 16h30) |
| Brevo: entregue | sim | sim | sim |
| Cliques **de gente** no link (amostra de 30) | 24 | — | **1** (29 só do robô de segurança) |
| Votos pelo link pessoal | 79% | 31 de 34 | **33 de 969** |
| Votos pelo link geral + código | — | 3 | **927** (1.113 códigos enviados) |

O que aconteceu na Halliburton:

1. O e-mail **foi entregue** ao servidor da empresa, e o filtro de segurança abriu os links
   segundos depois. Nenhuma pessoa abriu. Ou a mensagem ficou em quarentena, ou o
   trabalhador (muitos em plataforma offshore) não lê a caixa corporativa. Daqui não dá
   para saber qual das duas.
2. Todos foram para o link geral, que, como deve, recusa o e-mail corporativo. Isso
   levou 971 pessoas a cadastrar um e-mail pessoal e esperar o código **durante a
   votação**. 116 e-mails pediram 2 ou mais códigos. No Hotmail, os códigos foram
   "entregues" e não abertos (lixo eletrônico). 37 pessoas pediram e não votaram.
3. O reenvio das 11h15 mandou os 2.128 links de novo **para o mesmo endereço
   corporativo**: o aviso nunca usa o e-mail pessoal nem o Telegram que a pessoa
   cadastrou no link geral.
4. Só 9 pessoas usaram o Telegram, a única porta sem e-mail e sem SMS. Ele aparece
   como alternativa, não como caminho principal.

**Restrições que o plano respeita** (do usuário, 21/10):

- a fonte só entrega o e-mail corporativo; não há e-mail pessoal antes da votação;
- trabalhadores em plataforma offshore: SMS é limitado (o Telegram funciona no Wi-Fi);
- firewall e quarentena das empresas são uma barreira real e não dependem de nós.

**Ideia central:** descobrir **antes** da votação se o e-mail corporativo chega a gente
e, quando não chega, fazer o próprio trabalhador trazer o seu canal (e-mail pessoal ou
Telegram) com antecedência, pelo WhatsApp e pelos delegados. No dia, o link pessoal vai
para o canal que ele escolheu.

**Já feito (21/10):**

- **Alerta "link pessoal não usado"** (`lib/db/votacao-link-nao-usado.ts`, dd39d9e3): com
  a votação aberta, mostra no topo da rodada, no painel de Votações e na caixa de entrada
  quando a maior parte dos votos entra pelo código, mesmo com o link já entregue. Na
  Halliburton teria disparado às 10h47.
- **E-mail aos aptos com abertura e encerramento (dia e hora)** e a reunião por vídeo
  separada da votação (67ce7484).

---

## Fase 1 — O link vai para o canal que a pessoa escolheu

Objetivo: quem se identificou pelo link geral (e-mail pessoal ou Telegram) passa a
receber o link pessoal **por esse canal**, e não só no e-mail corporativo.

1. **Aviso por e-mail pessoal.** `dadosDoAviso` / `enviarLoteAviso`
   (`lib/db/votacao-aviso.ts`) passam a mandar o aviso também para `email_contato`
   quando ele existe. O corporativo continua recebendo; o pessoal é o segundo
   destinatário. O registro passa a guardar os dois envios (o corporativo em
   `aviso_email_para` e o pessoal numa coluna nova, ou numa tabela de envios).
2. **Aviso pelo Telegram.** Para quem tem `telegram_chat_id`, o bot manda uma mensagem
   curta: "Você está habilitado a votar em <rodada>. A votação abre <dia> às <hora>."
   Leva o botão com o link pessoal. **Sem CPF, sem nome da empresa, sem conteúdo de
   voto** (regra do AGENTS.md: o detalhe fica atrás do link).
3. **Envio automático** (`lib/db/votacao-aviso-auto.ts`): quem se cadastra pelo link geral
   **depois** do primeiro envio recebe o link pelo novo canal na próxima volta do tick
   (15 min). Isso já acontece com quem entra na lista; falta só valer para o contato novo.
4. **Reenvio que faz sentido.** O botão "reenviar a quem não votou" passa a oferecer
   "só pelos canais alternativos" quando o alerta da rodada estiver aceso, e deixa de
   repetir o e-mail corporativo que não chega. O reenvio também para de sobrescrever a
   data do primeiro envio (a armadilha do `reabrirAvisos`, já anotada no plano de 16/10).

SQL: uma migração (`npm run db:nova`) com o registro do envio pessoal e do envio pelo
Telegram por apto, com `comment on` e etiqueta `[lgpd:]`. Isso entra no processo de
votação de `docs/lgpd/processos.mjs`; o Telegram já é suboperador.

Medida de sucesso: numa rodada como a da Halliburton, quem fez o cadastro antes de votar
entra pelo link e não pede código.

---

## Fase 2 — Pré-cadastro antes da abertura

Objetivo: o cadastro do e-mail pessoal ou do Telegram acontece **dias antes**, com
calma, e não no meio da votação.

O link geral (`/votar`) já lista as votações futuras (`votacoesAbertas` inclui as que
ainda vão abrir) e já vincula o apto a elas. Falta transformar isso num fluxo de
preparação:

1. **Página do link geral em modo "antes da abertura"**: "A votação de <rodada> abre em
   <dia> às <hora>. Cadastre agora onde quer receber o seu link de voto." O **Telegram
   aparece primeiro** (sem código e sem SMS) e o e-mail pessoal em segundo. Ao terminar:
   "Pronto. Na abertura, o seu link chega no <canal>."
2. **Kit de divulgação na aba Divulgação da rodada**:
   - texto pronto para WhatsApp e para os delegados;
   - QR code do link geral;
   - cartaz em PDF (na linha do card que já existe).
   Tudo com a frase "cadastre-se antes".
3. **Contador na rodada**: "Pré-cadastrados: N de M aptos (por e-mail pessoal X, por
   Telegram Y)". Ele entra no resumo da aba Aptos e no alerta de aptos sem link: quem tem
   só o e-mail corporativo, num domínio que não entrega (fase 3), passa a contar como
   "sem link".
4. **Cuidados de identidade, que continuam os mesmos do link geral**: nome que cubra o da
   lista, CPF, nascimento e e-mail da empresa; alerta ao e-mail corporativo de que o
   cadastro foi feito; apto vinculado a outro contato não troca de dono.

Sem SQL novo previsto (as colunas do vínculo já existem). Depende da fase 1 para o link
chegar ao canal cadastrado.

---

## Fase 3 — Teste de entrega antecipado

Objetivo: saber, **dias antes**, se o e-mail corporativo daquela fonte chega a gente.
Assim a rodada é preparada pelo caminho certo.

1. **Aviso prévio** ao e-mail corporativo, N dias antes da abertura (padrão 5), junto com
   o convite ao pré-cadastro: "Você estará apto a votar em <dia>. Confirme que recebeu
   este e-mail." O botão **"Recebi"** é um formulário (POST), como o "Não sou eu": o robô
   de segurança abre endereços, mas não envia formulários. Assim só a confirmação humana
   conta.
2. **Indicador de entrega na rodada**: "Confirmaram o recebimento: N de M (x%) em <h>
   horas". Abaixo de um limite (ex.: 10% em 48 h), a rodada ganha o alerta **"o e-mail
   corporativo de @<domínio> não está chegando"**. Ele recomenda o pré-cadastro e o
   Telegram e aparece também no painel e na caixa de entrada.
3. **Memória por domínio e fonte**: o resultado fica guardado (domínio, data, taxa de
   confirmação e de uso do link pessoal na votação). Na próxima rodada da mesma fonte, a
   tela já mostra "na última votação, o e-mail @halliburton.com não chegou" desde a
   criação. A primeira carga sai do histórico: SLB boa, Halliburton ruim.
4. **Leitura automática da Brevo** (opcional, ver fase 4): os eventos de entrega e clique
   separam robô de gente sem depender só do botão.

SQL: confirmação de recebimento por apto (data) e a tabela do histórico por domínio. A
tabela leva comentários `[lgpd:]`; o domínio não é dado pessoal, mas a confirmação por
apto é.

---

## Fase 4 — Diagnóstico técnico do envio

Objetivo: reduzir a quarentena por reputação e ver a entrega sem consulta manual.

1. **Webhook da Brevo** (entregue, aberto, clique, recusa temporária, recusa definitiva,
   denúncia de spam): grava os eventos dos e-mails de votação e classifica o clique como
   "robô" (até 2 min depois da entrega, vários simultâneos) ou "gente". Alimenta o
   indicador da fase 3 e o alerta de 21/10. Entra em `docs/lgpd/suboperadores.md` (a
   Brevo já está lá; muda o dado tratado) e na retenção (RT) da votação.
2. **Autenticação do domínio de envio**: conferir SPF, DKIM e DMARC alinhados do
   remetente de cada entidade. Avaliar um subdomínio só para votação
   (ex.: `votacao.<entidade>`) e IP dedicado na Brevo quando o volume justificar. O IP
   compartilhado herda a reputação de terceiros.
3. **Códigos no Hotmail/Outlook**: a tela do código passa a dizer primeiro "procure no
   **Lixo eletrônico**" quando o e-mail é da Microsoft. Hoje o "Onde procurar" é genérico.
   Muda pouco e vale já.

Sem decisão de produto; os itens 1 e 2 dependem de acesso ao painel da Brevo e ao DNS das
entidades (do lado do usuário).

---

## Fase 5 — Contingência: voto sem código, em separado (decisão da direção)

Para quem, mesmo com tudo acima, não tem nenhum canal: identificação por **CPF +
nascimento + matrícula**, sem código. O voto vai para um **envelope pendente** e só conta
depois de a comissão deferir, como o voto em separado da urna. A estrutura de deferir,
indeferir e apurar só os deferidos já existe desde a fase 3 de 16/10.

**Risco central:** a empresa tem CPF, nascimento e matrícula de todos. Qualquer pessoa com
acesso ao cadastro de RH poderia votar no lugar do trabalhador. Por isso:

- nunca como porta aberta; só com a rodada marcada pela comissão, e com o alerta da fase
  3 ou o de 21/10 aceso;
- cada voto em separado avisa o e-mail corporativo e o contato cadastrado ("um voto foi
  registrado com os seus dados; não foi você? responda");
- a comissão vê os votos em separado com hora, IP/localidade e canal antes de deferir;
- edital e regimento precisam prever a modalidade (parecer jurídico).

Só se implementa com a decisão formal da direção e o texto do edital. Até lá, fica fora.

---

## Ordem recomendada

1. **Fase 4.3** (lixo eletrônico na tela do código): pequena, vale para todas as votações.
2. **Fase 1** (link pelo canal escolhido): sem ela, o pré-cadastro não leva a nada.
3. **Fase 2** (pré-cadastro e kit de divulgação).
4. **Fase 3** (teste de entrega e memória por domínio).
5. **Fase 4.1–4.2** (webhook da Brevo, autenticação do domínio), em paralelo, quando
   houver acesso.
6. **Fase 5**, só com decisão da direção.

Meta para medir: nas fontes de e-mail corporativo ruim, **70% ou mais dos votos sem
código** (link pessoal pelo canal escolhido, Telegram ou portal) e menos de 0,3 código
por votante. Na Halliburton foram 4% sem código e 1,15 código por votante.
