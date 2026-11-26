# Critérios de Aceite (Checklist)

Cards a partir do backlog de specs e board com colunas. O status de cada item, com o meio que o provou,
está em [`report.md`](report.md#critérios-de-aceite).

- [ ] **Criar o board leva ao quadro, ainda sem sincronizar**
  Depois de "Criar board", a pessoa cai em `/boards/<id>` (não mais em Configuração), com o painel "Backlog
  ainda não sincronizado", o botão "Sincronizar backlog" e as colunas vazias: Tarefas, uma por etapa do
  `board.yml` e Concluído. Cada coluna vazia mostra a dica dela ("As specs aprovadas aparecem aqui, na ordem
  do backlog." em Tarefas, "Arraste um card de Tarefas para cá." na primeira etapa, "Nenhum card" nas outras).
  A lista de boards também abre o quadro.

- [ ] **Sincronizar cria um card por spec, na ordem do índice**
  "Sincronizar backlog" lê o `specs/BACKLOG.md` do repositório e cria um card para cada spec linkada com
  frontmatter válido. Os cards com o status de pronto (`approved`) entram em Tarefas na ordem em que aparecem
  no índice (no `sample-app`: 1 Busca, 2 Atalhos, 3 Tema escuro). Um toast resume o resultado ("Backlog
  sincronizado: N criados, N atualizados, N órfãos.") e o cabeçalho passa a mostrar a data da sincronização.
  Sincronizar de novo sem mudança no repositório responde "0 criados, 0 atualizados, 0 órfãos.". O botão fica
  desabilitado enquanto a sincronização roda, o que segura o duplo clique.

- [ ] **Specs que não estão prontas ficam fora de Tarefas**
  Spec com status diferente de `approved` vira card, mas aparece só na seção recolhível "Não prontas" abaixo
  do quadro, com o título e o status num selo (no `sample-app`: Slack `proposed` e fork-cleanup `done`, esta
  achada pelo caminho `../docs/features/...`). Cada item abre o detalhe. A API recusa mover esse card para uma
  etapa com 409 `CARD_NOT_READY`.

- [ ] **Arquivos que não viraram card aparecem no aviso**
  Link do índice para arquivo inexistente ou com frontmatter sem `id`/`status` aparece num aviso acima do
  quadro, com caminho e motivo (`legacy-export.md` "arquivo não encontrado", `broken-frontmatter.md`
  "frontmatter sem id ou status"). O aviso tem botão de fechar. Arquivo sem frontmatter (README) é ignorado
  em silêncio. Slugs `sync` e `order` são recusados como `slug_invalid`.

- [ ] **Reordenar Tarefas persiste e sobrevive à sincronização**
  Arrastar um card sobre outro dentro de Tarefas, ou usar "Mover para o topo", "Subir" e "Descer" no menu,
  grava a nova ordem (`PUT cards/order`). Recarregar a página mantém a ordem, e uma nova sincronização não a
  desfaz. O menu só oferece o que muda alguma coisa: o primeiro da fila não tem "Subir" nem "Mover para o
  topo", o último não tem "Descer". Uma lista que não bate com a fila do servidor volta 409
  `CARD_ORDER_STALE`, e a tela restaura o estado anterior.

- [ ] **Mover entre colunas muda só a posição**
  Soltar um card numa coluna, ou escolher "Mover para <coluna>" no menu, move o card sem disparar etapa: o
  `state` continua `idle` ("Parado"), nenhuma execução é criada, e o card numa etapa mostra o selo de estado e
  a branch `feat/<slug>` em mono. Voltar para Tarefas põe o card no fim da fila. Soltar na própria coluna não
  faz nada. Etapa desconhecida responde 422 `CARD_STAGE_NOT_FOUND`; corpo inválido, 400 `VALIDATION_FAILED`.

- [ ] **A coluna sob arraste fica destacada nos dois temas**
  Enquanto um card passa sobre uma coluna que aceita o drop, ela ganha `bg-accent` e anel `ring-primary`, com
  contraste visível em claro e escuro. O destaque some ao soltar ou cancelar. A coluna em que o card já está
  não acende.

- [ ] **O menu "⋯" funciona por teclado e anuncia o resultado**
  Tab chega ao gatilho, cujo nome acessível é "Ações de <título>". Enter abre o menu com foco no primeiro item,
  as setas percorrem os itens e Enter executa. Depois de mover, a região `aria-live` anuncia "<título> movido
  para <coluna>.". No celular, onde o arrastar nativo não dispara por toque, o menu é o caminho para mover.

- [ ] **O título do card mostra foco visível**
  Com foco de teclado, o link do título do card ganha sublinhado, em claro e escuro.

- [ ] **Quem não prioriza não arrasta nem vê o menu**
  O `viewer` efetivo (ex.: `qa-reader`, convidado como Operador, mas com `read` no GitHub) vê o quadro sem o
  botão de sincronizar, sem menu "⋯" e com os cards não arrastáveis. A API espelha: 403
  `BOARD_ROLE_INSUFFICIENT` em `POST cards/sync`, `PUT cards/order` e `POST cards/<slug>/move`, e 200 nos três
  `GET`.

- [ ] **Admin personificando fica só na leitura**
  Um admin personificando o dono vê "Modo somente leitura", sem sincronizar, sem menu e sem arrastar. As
  escritas pela API voltam 403 `AUTH_REQUEST_IMPERSONATION_READ_ONLY`; as leituras funcionam.

- [ ] **Card de outro board não vaza**
  `GET /boards/<A>/cards/<slug>` de um documento cujo `boardId` é de outro board responde 404
  `CARD_NOT_FOUND`, e esse card não aparece na lista do board A. Slug inexistente também dá 404
  `CARD_NOT_FOUND`; board em que a pessoa não é membro dá 404 `BOARD_NOT_FOUND`.

- [ ] **Spec removida deixa o card órfão, nunca o apaga**
  Se a spec sai do índice, a sincronização marca o card como órfão: ele continua na coluna em que estava, com o
  selo "Spec removida". O detalhe mostra "A spec não está mais no repositório." com o caminho antigo. Voltar a
  spec ao índice tira a marca.

- [ ] **O detalhe mostra a spec como texto seguro e legível**
  O detalhe tem breadcrumb, título, selos de coluna e estado, branch, caminho da spec com link para o GitHub e
  sha curto. A spec aparece renderizada: tabela, lista de tarefas com checkbox desabilitado, código, links
  relativos resolvidos para o arquivo no GitHub e links externos em nova aba com `rel="noreferrer noopener"`.
  HTML cru (`<script>`) aparece como texto, `javascript:` e `data:` nunca viram `href`, e imagem vira o link
  "Imagem: <alt>". O frontmatter YAML do arquivo não aparece no corpo.

- [ ] **Recarga que remove coluna com cards é recusada**
  Se o `board.yml` novo tira uma etapa que ainda tem cards, "Recarregar configuração" responde 409
  `BOARD_RELOAD_STAGE_HAS_CARDS`, a tela mostra "A nova configuração remove uma coluna que ainda tem cards.
  Mova os cards antes de recarregar." e nada muda no board. Com a etapa vazia, a recarga aplica e lista a
  coluna em `changes.removed`.

- [ ] **O quadro é legível em claro, escuro e 390 px**
  A partir de `md`, as colunas ficam lado a lado com largura fixa e rolagem horizontal só dentro da faixa de
  colunas. Abaixo disso, empilham. Em 390 px a página não rola na horizontal, nem no quadro nem no detalhe; a
  tabela e o bloco de código da spec rolam dentro do próprio contêiner. O menu aberto cabe na tela.

- [ ] **O antd segue igual depois do `@layer antd`**
  Com o antd numa camada abaixo das utilidades do Tailwind, o link ativo da navegação "Seções do board" tem
  fundo `secondary` em claro e escuro, inclusive nas telas com tabela antd (Membros, Configuração). Tabela,
  menu de ações, `Popconfirm` e paginação mantêm fundo, cor e raio. Os itens do `ActionsMenu` têm nome
  acessível só com o rótulo ("Cancelar convite", "Mover para Análise"), sem o nome do ícone.
