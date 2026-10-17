# Plano de adequação — votação online e voto em separado (16/10/2026)

## Ponto de partida

Análise das 8 assembleias online desta versão (tenant SINDIPETRO-NF), comparando a
da SLB (14–15/10, poucas reclamações) com a da Baker e a da Expro (07/10, muitas
reclamações de código que não chegava).

| | Baker 07/10 | Expro 07/10 | SLB 14/10 | Green World 15/10 |
|---|---|---|---|---|
| Aptos | 1.075 | 231 | 1.598 | 89 |
| Link pessoal enviado | 218 (20%) | 231 | 1.598 (100%) | 89 |
| Votaram | 270 (25%) | 66 (29%) | 703 (44%) | 49 (55%) |
| Votaram sem pedir código | 84 (31%) | 8 (12%) | 557 (79%) | 12 (24%) |
| Códigos ao e-mail da empresa | ~155 | ~150 | 0 | 8 |
| Pediram código e não votaram | 23 | 10 | 1 | 4 |

As janelas da Baker e da Expro coincidiram; os códigos de uma e da outra se misturam
no registro de envios.

**Conclusões**

1. A chave "Voto em separado" **não influiu**: nenhum fluxo online a lê, e nenhuma
   assembleia online tem voto em separado registrado.
2. O que funcionou foi o **link pessoal para todos os aptos**, que entra sem código.
3. Também funcionaram as **três correções de 07/10**:
   - o link único deixou de mandar código ao e-mail corporativo;
   - a sessão do link passou a valer até o fim da votação;
   - a confirmação pelo Telegram.
4. Lacunas encontradas:
   - nada avisa quando há aptos sem link;
   - a data do envio é sobrescrita pelo reenvio, e o histórico se perde;
   - aptos duplicados inflam a participação: na SLB, "703 votaram" para 692 votos;
   - não se registra **por onde** cada pessoa votou (link pessoal, código ou portal).

> Correção de leitura: na SLB, só 478 links aparecem enviados "antes da abertura".
> O reenvio a quem não votou (`reabrirAvisos("nao_votaram")`) sobrescreve
> `aviso_email_em`, então não dá para saber quantos receberam o primeiro link antes
> da abertura. A fase 2 resolve isso.

Conclusão geral: o problema do código se resolve garantindo o link pessoal a todos,
antes da abertura. Votar sem código fica para depois, só se os números da fase 4
mostrarem que ainda sobra gente sem acesso.

---

## Fase 1 — Aviso de aptos sem link (sem SQL)

> **Feita em 16/10/2026.** O aviso na coluna do dia e o lembrete ao gestor viraram uma
> pendência da caixa de entrada ("Aptos sem link pessoal de voto"), que também vai no
> lembrete diário de pendências para quem o ligou em Meu perfil → Avisos.

Objetivo: ninguém abre uma votação online sem saber quantos aptos ainda estão sem o
link pessoal.

1. **Alerta na rodada**, no topo da página da rodada, quando há voto online e ainda
   há aptos sem link:
   - Texto: "**N aptos sem link pessoal**". O detalhe separa quem está pendente de
     envio, quem não tem e-mail, as falhas do provedor, quem desligou o aviso e os
     duplicados. Os dados já vêm de `resumoAvisoAptos`.
   - A cor acompanha o prazo: neutra com mais de 48 h para a abertura, âmbar com
     48 h ou menos, vermelha com 24 h ou menos e durante a votação.
   - Ações no próprio alerta:
     - **Enviar aos pendentes** (o envio em lotes que já existe);
     - **Reenviar falhas**;
     - **Ver quem está sem e-mail**, que leva à lista filtrada.
2. **Selo na lista de votações e na campanha**: "⚠ 37 sem link" ao lado da rodada,
   para quem não entra rodada por rodada.
3. **Filtro na lista de aptos da rodada**: Sem link · Sem e-mail · Falha · Duplicado.
   Cada linha tem o botão **Copiar link pessoal**, que já existe
   (`linkPessoalDoApto`), para mandar por WhatsApp a quem não tem e-mail.
4. **Exportar os links dos sem e-mail** em planilha (nome, matrícula, link), para
   distribuição por outros canais (delegados, WhatsApp).
5. **Aviso na coluna do dia do painel**: "Rodada X abre amanhã — N aptos sem link".
6. **Lembrete por e-mail ao gestor da votação**, 24 h antes da abertura, se ainda
   houver aptos sem link. Usa o mesmo tick diário dos lembretes de votação.

## Fase 2 — Envio e lista de aptos (SQL pequeno)

1. **Guardar o primeiro envio do link**: nova coluna `aviso_primeiro_em`, que o
   reenvio não apaga. Assim o alerta e os indicadores sabem quem recebeu o link
   antes da abertura.
2. **Envio automático opcional por rodada**: "Enviar os links automaticamente
   N horas antes da abertura" (padrão: 24 h). Usa nova coluna na rodada e o tick que
   já existe. Aptos incluídos depois recebem no tick seguinte.
3. **Duplicados**:
   - avisar já na importação: "11 aptos com e-mail ou CPF repetido", com a opção de
     **manter um só**;
   - participação conta **pessoas**, não linhas: na SLB, 692 e não 703. O mesmo
     vale para "votaram" na rodada, no acompanhamento e nos relatórios.
4. **Falhas de envio**: refazer as falhas automaticamente uma vez, 1 h depois.

## Fase 3 — Correções do voto em separado (sem SQL)

> **Feita em 16/10/2026.** A chave fica oculta na assembleia só online e é gravada
> desligada nela.

1. **A chave passa a valer**: desligada, o mesário não vê o botão "Voto em separado".
   Numa assembleia só online, a chave fica oculta (ou explica que vale só para as
   urnas) até existir a fase 5.
2. **Encerrar a apuração exige decisão**: com voto em separado pendente, o
   encerramento é recusado com "Decida os N votos em separado antes de encerrar".
3. **Decisões travadas após o encerramento**: Deferir e Indeferir ficam desativados.
   Para mudar, é preciso reabrir a apuração.
4. **Contagem na rodada**: somar só os votos válidos, ou seja, os normais mais os em
   separado **deferidos**. Hoje os números da rodada incluem os pendentes e os
   indeferidos.
5. **Urna física**: na tela de contagem, lembrar "inclua os N envelopes deferidos",
   com a lista dos deferidos daquela urna.
6. Atualizar o manual: votações e votação presencial.

## Fase 4 — Indicadores de entrega (SQL pequeno)

Objetivo: medir, em vez de depender de reclamações.

1. **Registrar o canal de acesso de cada voto** no apto, sem tocar no voto, que segue
   anônimo. Nova coluna `acesso_canal`, com um destes valores: link pessoal, código
   por e-mail, portal do filiado, Telegram ou urna.
2. **Cartão "Entrega" na apuração e no relatório completo**:
   - link enviado (antes ou depois da abertura);
   - votaram pelo link × pelo código;
   - códigos pedidos por domínio de e-mail;
   - pediram código e não votaram.

   São os números desta análise, gerados sozinhos a cada assembleia.
3. **Comparativo entre assembleias**, na campanha ou em Votações. Serve de base para
   decidir a fase 5.

## Fase 5 — A decidir depois (com os números da fase 4)

- **Voto em separado online sem código**, com:
  - CPF, nascimento e matrícula conferidos com a lista e o cadastro;
  - um por CPF;
  - triagem automática na apuração e "Deferir todos os conferidos";
  - o voto normal prevalecendo sobre o em separado.
- **Código por SMS ou WhatsApp**, como canal alternativo ao e-mail (custo por
  mensagem).

Os dois só se, depois das fases 1 e 2, ainda houver uma parcela relevante de aptos
que não consegue votar.

---

## Ordem sugerida

| Fase | Esforço | SQL | Antes da próxima assembleia (20/10)? |
|---|---|---|---|
| 1 — Aviso de aptos sem link | pequeno | não | **sim** |
| 3 — Correções do voto em separado | pequeno | não | sim (itens 2–4) |
| 2 — Envio e lista | médio | sim | parcial (duplicados) |
| 4 — Indicadores | médio | sim | não |
| 5 — Voto sem código / SMS | grande | sim | não |

A 1ª rodada do ACT 2026/2028, de 20/10, já está com a chave ligada e voto online.
É o primeiro teste das fases 1 e 3.
