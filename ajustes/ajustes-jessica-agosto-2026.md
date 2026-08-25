# Ajustes pedidos pela Jéssica — agosto/2026

> Documento de trabalho vivo — compilado de mensagens de texto, um áudio
> transcrito e 4 imagens de referência enviadas entre 17/08 e 25/08/2026.
> Marcar cada item como feito (`[x]`) conforme for implementado, sem apagar
> nada — é o histórico de pedidos, não só uma lista do momento.
>
> As imagens de referência ficam nesta mesma pasta (`ajustes/`) — ver
> Seção 8 para a lista exata e o que cada uma mostra.

---

## 1. Bugs relatados

- [ ] **Link do app "sai do ar" ao acessar.** A Jéssica baixou um link novo
      enviado pelo Eduardo — o login funciona normalmente, mas ao tentar
      acessar [não especificado qual tela/ação] o app fecha/trava. A
      mensagem original não diz qual parte trava — **precisa reproduzir com
      ela antes de investigar**, senão o risco é corrigir a coisa errada.
      > *"Baixei aqui o novo link que você me enviou. Ele entra normalmente,
      > porém, na hora de que vai acessar sair do ar, não está funcionando."*

- [ ] **Excluir Ordem de Serviço dá erro.** O botão de excluir já existe na
      tela de OS, mas a ação falha ao ser executada. Investigar a causa raiz
      (pode ser o mesmo tipo de bloqueio de dependência da Seção 7, ou outra
      coisa — não assumir sem checar o erro real).
      > *"Também verifique a OS, pois ela já possui o botão de excluir,
      > porém está apresentando erro quando tentamos realizar a exclusão."*

---

## 2. Notificações sonoras

- [ ] Som de notificação no **app do Técnico** quando chegar uma nova OS
- [ ] Som de notificação no **app do Parceiro** quando chegar uma nova OS
- [ ] Som de notificação no **app do Técnico** quando chegar uma nova
      proposta
- [ ] Som de notificação no **app do Parceiro** quando chegar uma nova
      proposta

> *"Você conseguiu adicionar o som de notificação no aplicativo do técnico e
> dos parceiros para avisar quando chegar uma nova OS ou uma nova
> proposta?"*

---

## 3. Nova tela de Agenda — Técnicos, Parceiros e Prestadores

Reformulação completa da tela **Agenda** do aplicativo, seguindo a
referência visual aprovada (ver imagens `agenda-estado-atual-vazio.png`,
`agenda-estado-atual-com-dados.png` e `agenda-estado-desejado.png` — Seção
8). Numeração preservada igual à spec original da Jéssica, pra facilitar
referência cruzada em conversas futuras.

**Problema central que motiva tudo isso** (item 19 da spec original, mas
vale ler primeiro): hoje o profissional precisa clicar em cada data pra
descobrir se tem algum agendamento. Isso precisa acabar — só de olhar a
tela, sem clicar em nada, ele já deve conseguir ver onde tem serviço,
quantos, o que vai fazer hoje, o que vem a seguir, e como está a semana/
quinzena/mês.

### 3.1 — Objetivo e público
- [ ] Atende Técnicos internos, Parceiros e Prestadores de serviço na mesma
      tela/estrutura
- [ ] Cada usuário vê **somente** os agendamentos vinculados ao próprio
      login, conforme suas permissões
- [ ] Visualização em 3 modos: **Semanal | Quinzenal | Mensal**, + atalho
      **Hoje**

### 3.2 — Cabeçalho
- [ ] Manter identidade visual atual: fundo preto/escuro, textos brancos/
      cinza, amarelo como cor de destaque
- [ ] Título "Agenda"
- [ ] Sino de notificações no canto superior direito, com badge vermelho de
      contagem quando houver
- [ ] Abas **Semana | Quinzena | Mês | Hoje** logo abaixo do cabeçalho, com
      o período selecionado destacado em amarelo
- [ ] Botão "Hoje" retorna imediatamente pra data atual

### 3.3 — Navegação entre períodos
- [ ] Exibir o período em consulta (ex.: "03 Ago - 09 Ago 2026")
- [ ] Setas **← período anterior** / **próximo período →**
- [ ] No modo Semana: avança/retrocede 1 semana
- [ ] No modo Quinzena: avança/retrocede 15 dias
- [ ] No modo Mês: avança/retrocede 1 mês

### 3.4 — Visão semanal
- [ ] Mostrar os 7 dias (SEG a DOM) com o número da data abaixo de cada um
- [ ] Dia selecionado destacado em amarelo
- [ ] **Indicadores de agendamento por dia** (o ponto central da mudança):
  - sem indicador = nenhum agendamento
  - 1 ponto = um agendamento
  - 2 pontos = dois agendamentos
  - 3 pontos = três ou mais agendamentos
- [ ] O profissional precisa conseguir ver, **antes de clicar em qualquer
      data**, quais dias da semana têm serviço

### 3.5 — Agendamentos do dia selecionado
- [ ] Mostrar a data por extenso (ex.: "Terça-feira, 04 de Agosto")
- [ ] Mostrar a contagem no canto direito (ex.: "4 agendamentos")
- [ ] Todos os serviços do dia aparecem em sequência na mesma tela — nunca
      só um, nunca exigir entrar em outra tela pra ver os demais

### 3.6 — Card de cada agendamento
Cada serviço em um card individual, contendo:
- [ ] Horário (ex.: `08:00`)
- [ ] Tipo de serviço (Instalação, Assistência Técnica, Perícia, Visita
      Técnica, Vistoria, Medição, Treinamento, Retorno)
- [ ] Cliente (ex.: "Cliente: Carlos Andrade")
- [ ] Endereço/local (ex.: "Rua das Flores, 123 - Centro")
- [ ] Status como etiqueta no lado direito do card: Confirmado, Pendente, Em
      andamento, Concluído, Reagendado, Cancelado
- [ ] Barra vertical colorida junto ao horário, indicando o status:
  - Azul — Confirmado
  - Amarelo/Laranja — Pendente
  - Roxo — Em andamento
  - Verde — Concluído
  - Vermelho — Cancelado
- [ ] Mesmo padrão de cor em toda a Agenda, sem exceção

### 3.7 — Ordenação
- [ ] Agendamentos do dia sempre ordenados por horário crescente (mais cedo
      → mais tarde), independente da ordem de cadastro no sistema

### 3.8 — Visão completa da semana
- [ ] Link "Ver todos os agendamentos da semana" abaixo dos serviços do dia
- [ ] Ao tocar: lista todos os compromissos da semana, agrupados por data
      (ex.: "Segunda, 03/08" → lista de horários/serviços daquele dia, depois
      "Terça, 04/08", etc.)

### 3.9 — Próximos agendamentos
- [ ] Seção fixa na parte inferior, mostrando os próximos compromissos
      **independente** da data selecionada no calendário
- [ ] Cada item mostra: dia, data, horário, tipo de serviço, cliente, status
- [ ] Link "Ver todos"

### 3.10 — Visão quinzenal
- [ ] Mostrar os próximos 15 dias em formato compacto
- [ ] Cada data mostra visualmente se tem agendamento (dias livres vs. dias
      com serviço vs. concentração de agendamentos)
- [ ] Resumo no topo (ex.: "12 agendamentos nos próximos 15 dias")
- [ ] Ao selecionar uma data, mostrar os serviços correspondentes abaixo

### 3.11 — Visão mensal
- [ ] Calendário mensal tradicional (SEG a DOM)
- [ ] Cada data mostra só o essencial: número do dia, indicadores/pontos,
      quantidade de serviços quando couber (ex.: "18 / ●●● / 3 serviços")
- [ ] **Não** colocar todas as informações dos serviços dentro do calendário
      mensal — só o resumo
- [ ] Ao tocar na data, abrir a lista completa dos serviços daquele dia
      abaixo

### 3.12 — Identificação do dia atual
- [ ] O dia de hoje precisa ter diferenciação visual mesmo quando não está
      selecionado (contorno amarelo, marcador, ou indicação "Hoje")

### 3.13 — Dia sem agendamento
- [ ] Mostrar "Sem agendamentos / Não há agendamentos para este dia."
- [ ] Os indicadores dos outros dias continuam visíveis no calendário mesmo
      nesse estado — ele não perde a visão geral só por estar num dia vazio

### 3.14 — Abertura do detalhe do serviço
- [ ] Todo card é clicável
- [ ] Ao tocar, abrir os detalhes completos daquele serviço/OS:
  - número da OS
  - cliente
  - telefone/contato
  - endereço
  - localização/mapa
  - data e horário
  - tipo de serviço
  - descrição
  - observações
  - produtos relacionados
  - documentos
  - anexos
  - fotos
  - responsável
  - status
- [ ] A Agenda deve funcionar como porta de entrada rápida pro atendimento
      que aquele profissional vai executar

### 3.15 — Regra por perfil (Técnico / Parceiro / Prestador)
- [ ] Mesma estrutura de tela pros 3 perfis
- [ ] O que muda é o dado mostrado, de acordo com o login (OS atribuída ao
      Técnico A aparece só na Agenda do Técnico A, e assim por diante)
- [ ] Um profissional não vê a agenda de outro, salvo permissão
      administrativa

### 3.16 — Atualização em tempo real
- [ ] Toda alteração feita pela administração (criar, mudar data/horário,
      reagendar, cancelar, atribuir OS, trocar responsável) precisa refletir
      na Agenda do profissional correspondente automaticamente — se uma OS
      muda de terça pra quinta, ela some da terça e aparece na quinta

### 3.17 — Notificações de mudança
- [ ] Notificar o profissional em: novo agendamento, reagendamento, mudança
      de horário, cancelamento, alteração importante da OS

### 3.18 — Barra inferior de navegação
- [ ] Manter: Início | Serviços | Perícias | Cursos | Agenda | Custódia |
      Perfil
- [ ] "Agenda" destacada em amarelo quando ativa

### 3.19 — Responsividade
- [ ] Prioridade pra smartphone, funcionando em diferentes tamanhos de tela
- [ ] Rolagem vertical quando houver muitos agendamentos
- [ ] **Não** encolher os cards artificialmente só pra caber tudo na tela de
      uma vez

---

## 4. Editar/Excluir em todos os cadastros

- [ ] Ferramentas cadastradas para teste **não mostram botão de excluir**
      hoje — precisa aparecer
- [ ] OS já tem botão de excluir, mas **dá erro** ao executar (mesmo item da
      Seção 1 — repetido aqui por fazer parte do padrão geral que ela cobrou)
- [ ] Levantamento geral: conferir quais outros cadastros do sistema ainda
      não têm Editar/Excluir funcionando — ela pediu isso como regra geral,
      não só nesses dois casos específicos

> *"Eduardo, outra coisa importante: tudo que a gente cadastra no sistema
> precisa ter as opções de Editar e Excluir, principalmente porque estamos
> realizando muitos testes e precisamos conseguir remover os cadastros que
> não serão mais utilizados."*

---

## 5. Perfis de acesso / permissões — dúvida a esclarecer antes de implementar

- [ ] **Pedido de fundo**: criar um perfil "Almoxarifado" com acesso restrito
      só às funções do setor (ferramentas, estoque, solicitações), dentro de
      um sistema geral de "Perfis de Acesso"/"Permissões" que permita criar
      outros setores no futuro, definindo por perfil quais menus/funções
      pode acessar, cadastrar, editar ou excluir

- [ ] ⚠️ **Mal-entendido a corrigir com ela ANTES de desenhar qualquer
      coisa.** Ela pergunta se `plataforma-garantias-reallliza.vercel.app`
      é a "plataforma matriz" — onde ficariam os cadastros de usuário e
      permissões — e se o `Reallliza-web.vercel.app` estaria vinculado a
      ela (usuário cadastrado na matriz, acesso aos módulos conforme
      permissão). **Isso está errado**: são dois sistemas completamente
      separados, com bancos de dados e cadastros de usuário próprios e
      independentes — não existe relação matriz/filial de autenticação
      entre eles. Essa confusão já causou problema em conversas anteriores
      (ver memória `ecossistema-reallliza-dois-sistemas`). Responder essa
      dúvida dela com clareza é pré-requisito pra qualquer desenho de
      sistema de permissões — se o desenho partir da premissa errada
      (autenticação centralizada no Garantias), fica tudo pra refazer
      depois.

> *"Eu observei que na plataforma-garantias-reallliza.vercel.app já existe
> essa opção de cadastro de usuários e permissões. A minha dúvida é: é
> nessa plataforma que devemos criar os perfis de acesso e definir as
> permissões dos usuários? [...] Quero entender essa estrutura corretamente
> antes de começarmos a criar os usuários dos diferentes setores."*

---

## 6. Cancelar pedido de ferramenta (app do Técnico)

Local: **Ferramentas → Pedido → Solicitação de Ferramenta**

- [ ] Botão "Cancelar Pedido" na tela de solicitação
- [ ] Ao clicar: a solicitação sai da fila pendente do Almoxarifado
- [ ] Ao clicar: status vira "Cancelado", com registro no histórico da
      solicitação

> *"Isso é importante porque pode acontecer de o técnico fazer uma
> solicitação por engano ou solicitar uma ferramenta incorreta e depois
> perceber que precisa cancelar o pedido."*

---

## 7. Limpeza de dados de teste (ação manual — não é feature nova)

Ela está travada pelos próprios bloqueios de exclusão (propositais) do
sistema e pede que o Eduardo faça a limpeza diretamente no banco, não que
o sistema passe a permitir isso pela UI.

- [ ] Zerar **todas as Ferramentas** cadastradas atualmente (bloqueadas por
      custódia/histórico/pedido vinculado)
- [ ] Zerar **todos os Orçamentos** (bloqueados por pagamento)
- [ ] Zerar **todas as OS** (bloqueadas por Orçamento de origem vinculado)

> ⚠️ **Restrição explícita dela — não fazer diferente disso**: *"quero
> deixar claro que não é para retirar o bloqueio de exclusão que você
> colocou. Pelo contrário, queremos manter essa regra da forma que está.
> [...] preciso apenas que você faça a limpeza/zeragem desses registros de
> teste diretamente no sistema, mantendo toda essa lógica de bloqueio e
> segurança para os próximos cadastros."*

- [ ] **Registrar pra depois, não fazer agora**: no futuro, excluir um
      Orçamento ou OS deve exigir senha/autorização do gestor do setor,
      pra evitar exclusão indevida por qualquer pessoa. Ela quer essa regra
      **além** do bloqueio de dependência que já existe, não no lugar dele.

- [ ] Depois da zeragem: ela segue os testes usando dados reais pra validar
      o fluxo completo

---

## 8. Imagens de referência (pasta `ajustes/`)

Confirmado — são 4 arquivos, mas só **2 estados distintos** da tela de
Agenda (não 3 como uma versão anterior deste documento presumia):

| Arquivo | O que mostra |
|---|---|
| `agenda-estado-atual-vazio.png` | Tela de Agenda **de hoje**, sem abas Semana/Quinzena/Mês, sem indicador nenhum, dia selecionado sem agendamento — o estado "pobre" que está sendo substituído |
| `agenda-estado-desejado.png` | Mockup com abas Semana/Quinzena/Mês/Hoje, indicadores de pontos por dia, cards de agendamento coloridos por status, "Ver todos os agendamentos da semana" e "Próximos agendamentos" — **esta é a referência visual completa que a Jéssica aprovou**, o alvo de toda a Seção 3 |
| `agenda-confirmacao-whatsapp-jessica.png` | Print do WhatsApp dela mesma, encaminhando as duas imagens acima juntas com a frase *"Queremos que fique assim, conforme a essa imagem"* — mantido como prova da aprovação, não traz informação visual nova |
| `bloqueio-exclusao-ferramenta.png` | Modal "Excluir ferramenta" (registro "Trena - 5 mt") mostrando o bloqueio real: custódia registrada, 4 registros de histórico, 1 pedido vinculado — isto é o **comportamento correto que deve ser preservado** (ver Seção 7), não um bug a corrigir |
