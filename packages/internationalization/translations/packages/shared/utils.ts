export const sharedUtilsTranslations = {
    "pt-br": {
        error: {
            unexpected: "Um erro inesperado aconteceu",
            requestIdLabel: "Código do erro",
        },
        apiErrors: {
            AUTH_INVALID_TOKEN: "Sessão inválida ou expirada.",
            AUTH_PROFILE_NOT_FOUND:
                "Sua conta não tem perfil neste app. Saia e entre de novo.",
            AUTH_INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
            AUTH_SIGN_IN_METHOD_DISABLED:
                "Este método de entrada não está disponível. Entre com o GitHub.",
            AUTH_GITHUB_PROFILE_UNAVAILABLE:
                "Não foi possível ler seu perfil do GitHub. Tente entrar novamente.",
            AUTH_MISSING_TOKEN: "Token de autenticação ausente.",
            AUTH_FORBIDDEN_ORIGIN: "Origem da requisição não permitida.",
            AUTH_NO_SESSION: "Nenhuma sessão ativa.",
            AUTH_SESSION_EXPIRED:
                "Sua sessão atingiu o tempo máximo. Entre novamente.",
            USERS_NOT_FOUND: "Usuário não encontrado.",
            ACCOUNT_NOTHING_TO_UPDATE: "Nada para atualizar.",
            ACCOUNT_AVATAR_INVALID:
                "A imagem informada não pode ser usada como foto de perfil.",
            ACCOUNT_UPDATE_FAILED:
                "Não foi possível salvar a sua conta. Tente de novo.",
            AUTH_SESSION_REVOKED:
                "Esta sessão foi encerrada. Entre novamente para continuar.",
            VALIDATION_FAILED: "Dados inválidos.",
            USERS_AUTH_WEAK_PASSWORD: "Senha muito fraca.",
            AUTH_PASSWORD_TOO_SHORT:
                "A senha deve ter pelo menos 8 caracteres.",
            USERS_AUTH_RATE_LIMITED:
                "Muitas tentativas. Tente novamente em instantes.",
            ROUTE_NOT_FOUND: "Este endereço não existe na API.",
            AUTH_RATE_LIMITED:
                "Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.",
            STORAGE_NOT_CONFIGURED:
                "O envio de arquivos não está configurado. Fale com o suporte.",
            UPLOAD_FILE_MISSING: "Nenhum arquivo foi enviado.",
            UPLOAD_FILE_TOO_LARGE: "O arquivo excede o tamanho máximo de 4 MB.",
            UPLOAD_FILE_TYPE_NOT_ALLOWED:
                "Formato não aceito. Envie JPG, PNG ou WebP.",
            UPLOAD_FAILED:
                "Não foi possível enviar o arquivo agora. Tente de novo em instantes.",
            GITHUB_APP_NOT_CONFIGURED:
                "A integração com o GitHub não está configurada. Fale com o suporte.",
            GITHUB_WEBHOOK_SIGNATURE_INVALID:
                "Assinatura do webhook do GitHub inválida.",
            GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE:
                "O evento do GitHub excede o tamanho máximo aceito.",
            GITHUB_WEBHOOK_PAYLOAD_INVALID:
                "O evento do GitHub chegou num formato inesperado.",
            GITHUB_REPOSITORY_NOT_ACCESSIBLE:
                "O GitHub App do board não tem acesso a este repositório.",
            GITHUB_RATE_LIMITED:
                "O GitHub limitou as chamadas do board por alguns minutos. Tente de novo em instantes.",
            GITHUB_UNAVAILABLE:
                "Não foi possível falar com o GitHub agora. Tente de novo em instantes.",
            GITHUB_APP_PERMISSION_MISSING:
                "O GitHub App do board não tem permissão para abrir pull requests neste repositório. Peça a quem administra o App para conceder Pull requests: Read and write.",
            GITHUB_PULL_REQUEST_REJECTED:
                "O GitHub recusou a PR. Confira se a branch do card está no repositório e tem commits que a base não tem.",
            GITHUB_WEBHOOK_PROCESSING_FAILED:
                "O evento do GitHub chegou, mas o board não conseguiu registrá-lo agora. O GitHub pode reenviá-lo.",
            BOARD_NOT_FOUND: "Board não encontrado.",
            BOARD_ALREADY_EXISTS: "Este repositório já tem um board.",
            BOARD_CONFIG_NOT_FOUND:
                "O repositório não tem .kanban/board.yml na branch padrão.",
            BOARD_CONFIG_INVALID:
                "O .kanban/board.yml tem erros. Corrija no repositório e leia de novo.",
            BOARD_IMPORT_FORBIDDEN:
                "Só quem é admin no repositório do GitHub pode criar ou recarregar o board.",
            BOARD_GITHUB_ACCOUNT_REQUIRED:
                "Entre com a sua conta do GitHub para criar um board.",
            BOARD_ROLE_INSUFFICIENT:
                "Seu papel neste board não permite esta ação.",
            BOARD_REPOSITORY_ACCESS_LOST:
                "Você não tem mais acesso a este repositório no GitHub, então não pode abrir o board.",
            BOARD_MEMBER_NOT_FOUND: "Membro não encontrado neste board.",
            BOARD_MEMBER_ALREADY_EXISTS:
                "Esta pessoa já é membro ou já tem convite neste board.",
            BOARD_MEMBER_ROLE_NOT_ALLOWED:
                "Você não pode dar um papel acima do seu.",
            BOARD_MEMBER_CHANGE_FORBIDDEN:
                "Você não pode mudar o dono, a si mesmo nem quem tem papel acima do seu.",
            BOARD_BACKLOG_SOURCE_MANUAL:
                "Este board usa backlog manual; não há specs para sincronizar.",
            BOARD_BACKLOG_INDEX_NOT_FOUND:
                "O índice do backlog não foi encontrado na branch base do repositório.",
            BOARD_RELOAD_STAGE_HAS_CARDS:
                "A nova configuração remove uma coluna que ainda tem cards. Mova os cards antes de recarregar.",
            CARD_NOT_FOUND: "Card não encontrado neste board.",
            CARD_NOT_READY:
                "Este card ainda não está pronto para sair de Tarefas.",
            CARD_STAGE_NOT_FOUND: "Esta coluna não existe mais no board.",
            CARD_ORDER_STALE:
                "O quadro mudou enquanto você reordenava. Ele foi atualizado; tente de novo.",
            CARD_QUESTIONS_NOT_PENDING:
                "Estas perguntas já foram respondidas ou foram substituídas. A tela foi atualizada.",
            CARD_ANSWERS_MISMATCH:
                "As respostas não batem com as perguntas. Recarregue o card e responda de novo.",
            CARD_EVENT_NOT_FOUND: "Este item não está mais na linha do tempo.",
            CARD_EVENT_NOT_EDITABLE:
                "Só quem escreveu o comentário pode editá-lo ou apagá-lo.",
            CARD_ARTIFACT_PATH_INVALID:
                "O caminho do artefato precisa apontar para um arquivo dentro do repositório.",
            CARD_RUN_ACTIVE:
                "Este card já está rodando uma etapa. Pare a execução ou espere ela terminar.",
            CARD_RUN_NOT_ACTIVE: "Este card não está rodando nenhuma etapa.",
            CARD_NOT_IN_PULL_REQUEST_STAGE:
                "Este card não está na etapa de PR do board.",
            CARD_BRANCH_INVALID:
                "Não foi possível montar uma branch válida para este card. Confira o branchPattern do board.yml.",
            CARD_DRAFT_NOT_APPROVED:
                "Este card ainda é um rascunho. Aprove a spec para ele entrar em Tarefas.",
            CARD_NOT_DRAFT: "Este card não está mais em Rascunhos.",
            CARD_SPEC_NOT_READY:
                "A spec ainda não está pronta: espere a rodada terminar e responda às perguntas abertas.",
            CARD_SPEC_DRAFT_MISSING:
                "O rascunho da spec não está na branch do card. Rode a escrita de novo.",
            CARD_SPEC_DRAFT_INVALID:
                "O rascunho da spec não tem um cabeçalho válido com o id deste card. Rode a escrita de novo.",
            SPEC_DRAFT_ATTACHMENT_INVALID:
                "Um dos anexos não foi encontrado ou não é seu. Remova e envie de novo.",
            SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED:
                "Formato não aceito. Anexe imagem (PNG, JPEG, WebP), PDF ou texto (.txt, .md).",
            SPEC_DRAFT_ATTACHMENT_TOO_LARGE:
                "O anexo passa do tamanho máximo de 3 MB.",
            SPEC_DRAFT_SLUG_UNAVAILABLE:
                "Já existem specs com nomes parecidos com este pedido. Mude o começo do texto e tente de novo.",
            RUN_EXECUTOR_UNAVAILABLE:
                "Nenhum runner seu está online. Inicie o runner e tente de novo.",
            RUNNER_TOKEN_INVALID: "Token do runner inválido.",
            RUNNER_REVOKED: "Este runner foi revogado. Registre de novo.",
            RUNNER_CODE_INVALID:
                "Código inválido ou vencido. Gere outro no board.",
            RUNNER_NOT_FOUND: "Runner não encontrado.",
            RUNNER_RUN_MISMATCH: "Esta execução não pertence a este runner.",
            AGENT_TOKEN_INVALID: "Token de execução inválido.",
            AGENT_TOKEN_EXPIRED: "O token desta execução expirou.",
            AGENT_TOOL_NOT_FOUND: "Ferramenta desconhecida.",
            AGENT_CARD_MISMATCH: "Este token não vale para este card.",
            AGENT_STAGE_MISMATCH: "Este token não vale para esta etapa.",
            AGENT_RUN_CLOSED: "Esta execução já terminou.",
            AGENT_ATTACHMENT_NOT_FOUND: "Este anexo não pertence a este card.",
            AGENT_TOOL_NOT_AVAILABLE:
                "Esta ferramenta ainda não está disponível.",
            HEALTH_DEPENDENCY_UNAVAILABLE:
                "O serviço está indisponível no momento.",
        },
    },
};
