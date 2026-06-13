# Atualização 10-11.06.2026 — Jessica (bugs + escopo)

> Pacote consolidado a partir de:
> - 11 áudios da Jessica (10-11/06) — transcritos via Whisper turbo (fonte: `C:\Users\delas\OneDrive\Documentos\whisper\*.ogg`, output em `C:\tmp\whisper-output\*.txt`).
> - 3 prints (mobile Fotos · web Detalhes da OS com data errada · mobile Etapas da Execução com fotos).
> - Lista de itens de escopo (Marcos 4-5) + lista de itens fora do escopo (aditivo) passados pelo Eduardo em 13/06.

---

## Parte 1 — Transcrição dos áudios (ordem cronológica)

### 🎙️ 2026-06-10 14:31:05 — Aviso geral
> Eduardo, boa tarde, tudo bem, né? Vou te passar alguns detalhes do app que eu criei uma ordem de serviço aqui e estou testando a questão das etapas. E aí não está conforme o que a gente tinha solicitado. Vou te passar, tá bom?

### 🎙️ 2026-06-10 14:31:56 — Etapas: foto não fica salva + remover Galeria
> Na parte das etapas da execução, quando eu vou lá na opção para tirar foto, né? Ela dá a opção de a gente registrar naquele momento, porém a foto ela não carrega. E quando ela faz só a opção de carregar, ela vai e sai da opção das etapas, vai lá para o início do aplicativo. E aí também a gente precisa que tire aquele botão de galeria, por quê? Não pode ter o botão de galeria porque a foto é para tirar no momento que ele está lá executando. E não ele pegar uma imagem e já salva na galeria dele, tá bom?

### 🎙️ 2026-06-10 14:32:31 — Confirmando: foto "antes" é da criação da OS, não da etapa
> Aqui, ó. Toda vez que eu clicava no botão tirar foto, ele só dá a opção pra gente retirar a foto naquele momento. Carrega, só que não fica a foto. Essa foto que você tá vendo aí de antes, foi que eu coloquei quando eu tava gerando a ordem de serviço, e não que eu tirei no momento. Tá certo?

### 🎙️ 2026-06-10 14:32:44 — Reforça: tirar botão Galeria
> E esse botãozinho aí de galeria, a gente deve retirar, porque não é para ele pegar fotos salva da galeria, e sim registrar no momento que ele está executando.

### 🎙️ 2026-06-10 14:33:11 — Mesma falha em "Finalizar etapa"
> Aí outra coisa, quando eu coloco finalizar a etapa, ele pede para registrar uma foto. Aí quando eu coloco para tirar foto, ela também carrega e vai lá para o início do aplicativo. E não libera a segunda etapa.

### 🎙️ 2026-06-10 14:51:19 — Bug data: agendamento aparece 1 dia antes
> Eduardo, aqui também na questão das datas de criação e de agendamento, né? Eu criei a ordem de serviço hoje, pronto. Mas agendamento, eu também coloquei para hoje. E por que ele sempre fica um dia antes do dia que eu fiz a criação da ordem de serviço?

### 🎙️ 2026-06-10 14:51:45 — OS criada continua não indo pra agenda do técnico
> E outra coisa, a ordem de serviço que a gente cria aqui na plataforma, ela não está indo automaticamente para a agenda do técnico, que ela deveria ir para a agenda. Ela fica lá nas ordens atribuídas a ele, mas a gente gostaria que na agenda dele tivesse a OS.

### 🎙️ 2026-06-10 14:52:00 — Reforça: OS criada deve virar evento na agenda automaticamente
> Que no caso seria automaticamente, né? A partir do momento que a gente cria a OS, ela já vai a data e o número da OS para a agenda dele.

### 🎙️ 2026-06-10 14:55:44 — Etapas concluídas: para onde foram as fotos?
> Pronto, Eduardo. Aqui, as etapas, elas já estão mostrando que estão concluídas. Certo? Agora, mostra quantas fotos tem em cada etapa. Mas essas fotos não deveria ficar mostrando aqui na etapa? E onde é que essas fotos, para onde elas estão indo?

### 🎙️ 2026-06-11 11:22:55 — Bug: avaliação interna do técnico dá erro
> Eduardo, eu estou aqui na plataforma e aí eu fui na avaliação interna, né? E quando eu fui fazer a nova avaliação do técnico, fica aparecendo uma mensagem de erro.

### 🎙️ 2026-06-11 15:51:33 — Como adicionar especialidades a um técnico já cadastrado?
> ver outra coisa, Eduardo, eu queria ver outra coisa com você, é em relação assim, quando eu fizer o cadastro, né, de um técnico, aí lá já está mostrando a especialidade, né, que eu posso selecionar, mas quando for necessário de eu colocar outra especialidade nele, como é que eu vou fazer? Porque até então eu não vi a opção de eu acrescentar em um usuário já criado.

---

## Parte 2 — Análise dos prints (3 imagens anexadas)

### Print 1 — Tela "Fotos" da OS no mobile
- Header "Fotos" + aviso "1 envio pendente"
- Botão amarelo **Tirar Foto** + botão outline **Galeria** (lado a lado)
- 2 thumbnails: "Antes" (foto do prédio) e "Durante" (print do mapa Google Maps, **legendado "Limpeza do ambiente"** — provavelmente errado: a Jessica tirou um print do mapa, não uma foto da execução)
- **Confirma os bugs 2 e 4**: o botão Galeria existe (precisa sair) e a tela permite uploads que não pertencem àquela etapa.

### Print 2 — Detalhes da OS no painel web (browser desktop)
- TÉCNICO ATRIBUÍDO: Iago Roque da Silva (Técnico)
- PARCEIRO: Sem parceiro vinculado
- **DATAS** ← o ponto chave:
  - Criação: **10/06/2026** ✅
  - **Agendamento: 09/06/2026** ❌ (Jessica agendou para 10/06)
  - Início: 10/06/2026, 08:58 ✅
  - Conclusão: vazio
- **Confirma o bug 6** (timezone): o `<input type="date" value="2026-06-10">` virou `09/06` ao ser salvo/exibido, comportamento clássico de `new Date('2026-06-10')` interpretado como UTC 00:00 → exibido no Brasil (UTC-3) como 09/06 21:00 → mostrado como "09/06".

### Print 3 — Etapas da Execução no mobile (José Ricardo - depois)
- Banner amarelo: "Conclua cada etapa em ordem. Você não pode pular etapas nem finalizar a OS sem todas concluídas." ✅
- **Etapa 1 — Limpeza da base**: concluída em 10/06 14:28, **1/1 foto(s)**, observação "Ghhfgh".
- **Etapa 2 — Aplicação de primer**: concluída em 10/06 14:54, **2/1 foto(s)**, observação "Ok". Note o contador `2/1` — passou do mínimo.
  - **Mojibake nos títulos**: "Aplica**Ã§Ã£o** de primer" / "Aplica**Ã§Ã£o** de autonivelante" — encoding double-UTF8 corrompido no `metadata.name` dos `step_template_items` (já mostrado antes; relação com migrations seed que gravou em ISO-8859-1).
- **Etapa 3 — Aplicação de autonivelante**: 0/1 foto, botão "Iniciar etapa" disponível (gate sequencial funcionando).
- **Confirma o bug 9**: a tela mostra contador "1/1 foto(s)" mas a Jessica não vê as fotos em si na linha da etapa — quer a lista/thumbnails inline.

---

## Parte 3 — Bugs / asks consolidados (numerados pra rastreio)

| # | Origem | Severidade | Descrição curta |
|---|---|---|---|
| 1 | Áudio 14:31:56 + 14:32:31 + 14:33:11 + Print 1 | 🔴 Bloqueante | "Tirar Foto" na etapa: câmera abre, foto tirada **não persiste**, app sai do contexto e cai na home. Mesmo problema no "Finalizar etapa". |
| 2 | Áudios 14:31:56 + 14:32:44 + Print 1 | 🟠 Polish | Remover botão **Galeria** da tela de fotos por etapa (evidência tem que ser ao vivo). |
| 3 | Áudio 14:55:44 + Print 3 | 🟡 UX | Mostrar **thumbs das fotos** dentro do card da etapa concluída (hoje só tem contador "1/1 foto(s)"). |
| 4 | Áudio 14:51:19 + Print 2 | 🔴 Bloqueante | **Bug timezone**: data de agendamento gravada/exibida 1 dia antes do escolhido. Input "2026-06-10" → DB grava como "2026-06-09" (provável `new Date(str).toISOString().slice(0,10)` em algum ponto). |
| 5 | Áudios 14:51:45 + 14:52:00 | 🔴 Bloqueante | OS criada via painel **não vira evento na agenda do técnico** automaticamente. Eu entreguei o fix `createScheduleFromOs` no POST em v4 (commit `8f20470`) — **regressão ou efeito colateral do bug timezone (data inválida → helper retorna `skipped_no_date`)**. |
| 6 | Áudio 11/06 11:22 | 🔴 Bloqueante | **Avaliação interna** (`/dashboard/avaliacoes` ou similar): ao criar nova avaliação técnica, **mensagem de erro** (não especificada). |
| 7 | Áudio 11/06 15:51 | 🟠 Feature ausente | Não existe **fluxo de editar especialidades** de um usuário já cadastrado no painel admin. Cadastrar uma vez é OK; depois trava. |
| 8 | Print 3 (visível) | 🟡 Polish | **Mojibake** "Ã§Ã£o" nos nomes das etapas (encoding em `step_template_items.name` ou no metadata snapshot). Já era; agora acumula. |

---

## Parte 4 — Lista de escopo passada pelo Eduardo (13/06)

### ✅ Dentro do escopo atual (Marco 4 / Marco 5 — sem aditivo)

1. **Cursos / Biblioteca Técnica**
   - Painel admin web: cadastrar categorias, subcategorias e módulos de vídeo.
   - Estrutura de dados básica já existe; painel de gestão e hierarquia completa (categoria → subcategoria → módulo) entram no Marco 4.

2. **Perfil Técnico Avançado**
   - Exibição de especialidades técnicas e avaliações no app (já entregue na v4 do perfil).
   - Painel web de gestão de avaliações técnicas por especialidade.
   - Histórico de evolução e médias de avaliação.

3. **Central de Notificações organizada (lidas / não lidas / prioridade)** no app.

4. **Agenda — Mapa de disponibilidade** (visão "Livre / Parcialmente ocupado / Totalmente ocupado").

### 💰 Fora do escopo — exigem aditivo contratual

1. **Módulo de Ferramentas / Almoxarifado** — módulo completo (BD + backend + web admin + integração com app): controle de estoque, pedidos do técnico, custódia, devolução, manutenção, histórico, painel de indicadores.

2. **Sistema de Gamificação — Níveis Bronze / Prata / Ouro** — cálculo automático de nível com base em especialidades, estrelas e avaliações de clientes.

3. **Especialidades Dinâmicas — Gestão pelo Admin** — CRUD de competências avaliáveis (rodapé, piso SPC, acabamento fino, liderança…) pelo painel web sem deploy.

4. **Notificação Sonora com Voz "Realliza"** — identidade sonora própria com gravação de áudio + notificação customizada por tipo de evento.

5. **Etapas de Execução com Foto Início + Foto Fim por etapa** — extensão sobre o sistema atual (que tem FOTO_INICIAL, PREPARACAO, EXECUCAO, FINALIZACAO globais). Exige schema novo, backend, UI mobile.

6. **Assinatura do Cliente como Bloqueio Obrigatório** — impedir "Finalizar OS" sem assinatura coletada. `SignatureScreen.tsx` existe; falta o gate.

7. **Controle de Progresso de Cursos** — % vídeos assistidos, módulos concluídos, progresso por categoria, com possibilidade de gate para liberar tipos de OS.

8. **Conteúdo Obrigatório vs Livre nos Cursos** — cursos que o técnico precisa concluir antes de receber determinado tipo de OS (regra de negócio entre módulo de cursos e módulo de OS).

---

## Parte 5 — Recomendação de tratamento (pré-planejamento)

**Antes do próximo release:** resolver os 🔴 bloqueantes (1, 4, 5, 6) e o polish 2 (botão Galeria). O bug 4 (timezone) **provavelmente é a causa raiz do bug 5** (agenda não cria) — uma data de agendamento corrompida faz o helper `createScheduleFromOs` cair em `skipped_no_date` ou conflito invisível.

**Próximo release pode acomodar:** 3 (thumbs na etapa), 7 (editar especialidades de usuário), 8 (mojibake).

**Marco 4/5 segue planejado:** itens da seção ✅.

**Aguarda aditivo:** itens da seção 💰 (montar proposta separada).
