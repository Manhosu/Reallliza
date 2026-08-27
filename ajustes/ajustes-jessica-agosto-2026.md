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

- [x] **Excluir Ordem de Serviço dá erro.** ~~Investigar~~ Causa raiz
      encontrada: o botão na tela de **detalhe** da OS nunca chamava
      exclusão de verdade — só mudava o status pra "Cancelado". Religado ao
      mesmo padrão de exclusão segura da listagem (25/08/2026).
      > *"Também verifique a OS, pois ela já possui o botão de excluir,
      > porém está apresentando erro quando tentamos realizar a exclusão."*

---

## 2. Notificações sonoras

- [x] Som de notificação no **app do Técnico** quando chegar uma nova OS
- [x] Som de notificação no **app do Parceiro** quando chegar uma nova OS
- [x] Som de notificação no **app do Técnico** quando chegar uma nova
      proposta
- [x] Som de notificação no **app do Parceiro** quando chegar uma nova
      proposta

> *"Você conseguiu adicionar o som de notificação no aplicativo do técnico e
> dos parceiros para avisar quando chegar uma nova OS ou uma nova
> proposta?"*

**Já estava pronto** — `os_assigned` e `proposal_available` já disparam com
`priority: "high"`, que já usa o canal Android com som customizado
(`realliza.mp3`). Não foi preciso mudar nada, só confirmar (25/08/2026).

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
- [x] Atende Técnicos internos, Parceiros e Prestadores de serviço na mesma
      tela/estrutura
- [x] Cada usuário vê **somente** os agendamentos vinculados ao próprio
      login, conforme suas permissões
- [x] Visualização em 3 modos: **Semanal | Quinzenal | Mensal**, + atalho
      **Hoje**

### 3.2 — Cabeçalho
- [x] Manter identidade visual atual: fundo preto/escuro, textos brancos/
      cinza, amarelo como cor de destaque
- [x] Título "Agenda"
- [x] Sino de notificações no canto superior direito, com badge vermelho de
      contagem quando houver
- [x] Abas **Semana | Quinzena | Mês | Hoje** logo abaixo do cabeçalho, com
      o período selecionado destacado em amarelo
- [x] Botão "Hoje" retorna imediatamente pra data atual

### 3.3 — Navegação entre períodos
- [x] Exibir o período em consulta (ex.: "03 Ago - 09 Ago 2026")
- [x] Setas **← período anterior** / **próximo período →**
- [x] No modo Semana: avança/retrocede 1 semana
- [x] No modo Quinzena: avança/retrocede 15 dias
- [x] No modo Mês: avança/retrocede 1 mês

### 3.4 — Visão semanal
- [x] Mostrar os 7 dias (SEG a DOM) com o número da data abaixo de cada um
- [x] Dia selecionado destacado em amarelo
- [x] **Indicadores de agendamento por dia** (o ponto central da mudança):
  - sem indicador = nenhum agendamento
  - 1 ponto = um agendamento
  - 2 pontos = dois agendamentos
  - 3 pontos = três ou mais agendamentos
- [x] O profissional precisa conseguir ver, **antes de clicar em qualquer
      data**, quais dias da semana têm serviço

### 3.5 — Agendamentos do dia selecionado
- [x] Mostrar a data por extenso (ex.: "Terça-feira, 04 de Agosto")
- [x] Mostrar a contagem no canto direito (ex.: "4 agendamentos")
- [x] Todos os serviços do dia aparecem em sequência na mesma tela — nunca
      só um, nunca exigir entrar em outra tela pra ver os demais

### 3.6 — Card de cada agendamento
Cada serviço em um card individual, contendo:
- [x] Horário (ex.: `08:00`)
- [x] Tipo de serviço (Instalação, Assistência Técnica, Perícia, Visita
      Técnica, Vistoria, Medição, Treinamento, Retorno)
- [x] Cliente (ex.: "Cliente: Carlos Andrade")
- [x] Endereço/local (ex.: "Rua das Flores, 123 - Centro")
- [x] Status como etiqueta no lado direito do card: Confirmado, Pendente, Em
      andamento, Concluído, Reagendado, Cancelado
- [x] Barra vertical colorida junto ao horário, indicando o status:
  - Azul — Confirmado
  - Amarelo/Laranja — Pendente
  - Roxo — Em andamento
  - Verde — Concluído
  - Vermelho — Cancelado
- [x] Mesmo padrão de cor em toda a Agenda, sem exceção

### 3.7 — Ordenação
- [x] Agendamentos do dia sempre ordenados por horário crescente (mais cedo
      → mais tarde), independente da ordem de cadastro no sistema

### 3.8 — Visão completa da semana
- [x] Link "Ver todos os agendamentos da semana" abaixo dos serviços do dia
- [x] Ao tocar: lista todos os compromissos da semana, agrupados por data
      (ex.: "Segunda, 03/08" → lista de horários/serviços daquele dia, depois
      "Terça, 04/08", etc.)

### 3.9 — Próximos agendamentos
- [x] Seção fixa na parte inferior, mostrando os próximos compromissos
      **independente** da data selecionada no calendário
- [x] Cada item mostra: dia, data, horário, tipo de serviço, cliente, status
- [x] Link "Ver todos"

### 3.10 — Visão quinzenal
- [x] Mostrar os próximos 15 dias em formato compacto
- [x] Cada data mostra visualmente se tem agendamento (dias livres vs. dias
      com serviço vs. concentração de agendamentos)
- [x] Resumo no topo (ex.: "12 agendamentos nos próximos 15 dias")
- [x] Ao selecionar uma data, mostrar os serviços correspondentes abaixo

### 3.11 — Visão mensal
- [x] Calendário mensal tradicional (SEG a DOM)
- [x] Cada data mostra só o essencial: número do dia, indicadores/pontos,
      quantidade de serviços quando couber (ex.: "18 / ●●● / 3 serviços")
- [x] **Não** colocar todas as informações dos serviços dentro do calendário
      mensal — só o resumo
- [x] Ao tocar na data, abrir a lista completa dos serviços daquele dia
      abaixo

### 3.12 — Identificação do dia atual
- [x] O dia de hoje precisa ter diferenciação visual mesmo quando não está
      selecionado (contorno amarelo, marcador, ou indicação "Hoje")

### 3.13 — Dia sem agendamento
- [x] Mostrar "Sem agendamentos / Não há agendamentos para este dia."
- [x] Os indicadores dos outros dias continuam visíveis no calendário mesmo
      nesse estado — ele não perde a visão geral só por estar num dia vazio

### 3.14 — Abertura do detalhe do serviço
- [x] Todo card é clicável
- [x] Ao tocar, abrir os detalhes completos daquele serviço/OS:
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
- [x] A Agenda deve funcionar como porta de entrada rápida pro atendimento
      que aquele profissional vai executar

### 3.15 — Regra por perfil (Técnico / Parceiro / Prestador)
- [x] Mesma estrutura de tela pros 3 perfis
- [x] O que muda é o dado mostrado, de acordo com o login (OS atribuída ao
      Técnico A aparece só na Agenda do Técnico A, e assim por diante)
- [x] Um profissional não vê a agenda de outro, salvo permissão
      administrativa

### 3.16 — Atualização em tempo real
- [x] Toda alteração feita pela administração (criar, mudar data/horário,
      reagendar, cancelar, atribuir OS, trocar responsável) precisa refletir
      na Agenda do profissional correspondente automaticamente — se uma OS
      muda de terça pra quinta, ela some da terça e aparece na quinta

### 3.17 — Notificações de mudança
- [x] Notificar o profissional em: novo agendamento, reagendamento, mudança
      de horário, cancelamento, alteração importante da OS

### 3.18 — Barra inferior de navegação
- [x] Manter: Início | Serviços | Perícias | Cursos | Agenda | Custódia |
      Perfil
- [x] "Agenda" destacada em amarelo quando ativa

### 3.19 — Responsividade
- [x] Prioridade pra smartphone, funcionando em diferentes tamanhos de tela
- [x] Rolagem vertical quando houver muitos agendamentos
- [x] **Não** encolher os cards artificialmente só pra caber tudo na tela de
      uma vez

---

## 4. Editar/Excluir em todos os cadastros

- [x] Ferramentas cadastradas para teste **não mostram botão de excluir**
      hoje — precisa aparecer (guarda de papel adicionada no Catálogo,
      25/08/2026)
- [x] OS já tem botão de excluir, mas **dá erro** ao executar (mesmo item da
      Seção 1 — repetido aqui por fazer parte do padrão geral que ela cobrou)
- [x] Levantamento geral: conferir quais outros cadastros do sistema ainda
      não têm Editar/Excluir funcionando — religados **Templates de
      Execução**, **Cadastros de Empresas** e **Homologação** (25/08/2026).
      Ficaram de fora, por razão específica: `clientes` (é visão agregada,
      não cadastro próprio), `niveis` (linhas de configuração fixa), e
      `solicitacoes` (tela já sem uso)

> *"Eduardo, outra coisa importante: tudo que a gente cadastra no sistema
> precisa ter as opções de Editar e Excluir, principalmente porque estamos
> realizando muitos testes e precisamos conseguir remover os cadastros que
> não serão mais utilizados."*

---

## 5. Perfis de acesso / permissões — dúvida a esclarecer antes de implementar

- [x] **Pedido de fundo**: criar um perfil "Almoxarifado" com acesso restrito
      só às funções do setor (ferramentas, estoque, solicitações) — feito
      pelo caminho rápido (25/08/2026): papel fixo no sistema, replicando o
      mesmo padrão já usado pro papel "sponsor". **Não** é o sistema geral
      de "Perfis de Acesso"/Permissões configuráveis por setor que o pedido
      original menciona — isso não existe hoje e seria semanas de trabalho;
      registrado como pedido em aberto pra quando fizer sentido priorizar

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

- [x] Botão "Cancelar Pedido" na tela de solicitação
- [x] Ao clicar: a solicitação sai da fila pendente do Almoxarifado
- [x] Ao clicar: status vira "Cancelado", com registro no histórico da
      solicitação

**Já estava pronto** — ponta-a-ponta, sem precisar de código novo. Ação foi
só confirmar onde o botão fica (`ToolsScreen.tsx`, aba "Pedidos"), já que
ela pode ter procurado na tela de criar pedido (25/08/2026).

> *"Isso é importante porque pode acontecer de o técnico fazer uma
> solicitação por engano ou solicitar uma ferramenta incorreta e depois
> perceber que precisa cancelar o pedido."*

---

## 7. Limpeza de dados de teste (ação manual — não é feature nova)

Ela está travada pelos próprios bloqueios de exclusão (propositais) do
sistema e pede que o Eduardo faça a limpeza diretamente no banco, não que
o sistema passe a permitir isso pela UI.

- [x] Zerar **todas as Ferramentas** cadastradas atualmente (bloqueadas por
      custódia/histórico/pedido vinculado) — feito direto no banco
      (25/08/2026): 6 ferramentas, 1 unidade, 8 custódias, 44 eventos, 20
      pedidos
- [x] Zerar **todos os Orçamentos** (bloqueados por pagamento) — 47
      orçamentos, 68 itens, 53 pagamentos (R$ 105.515,61) e a única fatura
      de teste existente (`"Fatura teste F4 NFe"`, nunca chegou a emitir)
- [x] Zerar **todas as OS** (bloqueadas por Orçamento de origem vinculado) —
      41 OS e tudo em cascata (agendamentos, itens, histórico de status,
      etapas executadas, checklists, fotos). Confirmado com o Eduardo antes
      de rodar, dado o volume e o valor em pagamentos envolvido

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

---

## 9. Repasse automático de pagamento (Asaas) — permissão de API pendente

- [ ] **Liberar "operações de saque via API" na chave de produção da Asaas.**
      O código dos dois repasses automáticos (prestador e taxa da
      Reallliza) já está pronto e testado — ele chama a Asaas pra criar a
      transferência PIX assim que o pagamento é confirmado. As duas
      chamadas batem no mesmo erro (`insufficient_permission`): a chave de
      API da conta Asaas da Reallliza não tem permissão pra iniciar
      transferências (saques) via API. Enquanto isso não for liberado,
      tudo fica certinho calculado e registrado no sistema — só a
      transferência final ainda sai manual (o José faz o PIX na mão, pelo
      próprio painel da Asaas).

  **Como resolver**: quem administra a conta Asaas da Reallliza (José)
  precisa abrir um chamado com o suporte da Asaas (chat do painel ou
  suporte@asaas.com) pedindo a liberação de **"operações de saque via
  API"** (também chamada de "Transferências via API") pra chave de API em
  uso em produção. Por mexer com movimentação de dinheiro, a Asaas
  costuma pedir confirmação de identidade/segurança antes de liberar —
  não é algo que o Eduardo consiga destravar por código, é uma permissão
  de conta que só o próprio dono resolve com o suporte deles. Depois de
  liberada, não precisa de nenhuma mudança no sistema — a próxima
  transferência automática já sai sozinha.

> *"E lembrando o ponto pendente de antes: as duas transferências
> (prestador e Reallliza) esbarram na mesma permissão que a Asaas ainda
> não liberou pra chave de API de vocês ('operações de saque via API').
> Enquanto isso não for resolvido com a Asaas, tudo fica registrado
> certinho no sistema, só a transferência final ainda sai manual."*
> — Jéssica, 27/08/2026, seguido de: *"qual a liberação que esta faltando
> a Asaas? pode me informar como eu resolvo essa situação?"*
