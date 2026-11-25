export const sharedUtilsTranslations = {
    "pt-br": {
        error: {
            unexpected: "Um erro inesperado aconteceu",
            requestIdLabel: "Código do erro",
        },
        apiErrors: {
            AUTH_INVALID_TOKEN: "Sessão inválida ou expirada.",
            AUTH_INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
            ADMIN_FORBIDDEN: "Você não tem permissão para esta ação.",
            AUTH_REQUEST_USER_ID_MISMATCH: "Contexto da requisição inválido.",
            AUTH_REQUEST_USER_ROLE_MISMATCH: "Contexto da requisição inválido.",
            AUTH_REQUEST_PANEL_FORBIDDEN:
                "Painel não permitido para este usuário.",
            AUTH_REQUEST_IMPERSONATION_FORBIDDEN:
                "Não é possível atuar como outro usuário.",
            AUTH_REQUEST_ADMIN_TARGET_INVALID:
                "Contexto da requisição inválido.",
            AUTH_REQUEST_IMPERSONATION_REQUIRED:
                "Selecione um usuário para este painel.",
            AUTH_REQUEST_IMPERSONATION_TARGET_INVALID:
                "Usuário inválido para atuação.",
            AUTH_REQUEST_IMPERSONATION_READ_ONLY:
                "Somente leitura: você está atuando como outro usuário.",
            AUTH_MISSING_TOKEN: "Token de autenticação ausente.",
            AUTH_FORBIDDEN_ORIGIN: "Origem da requisição não permitida.",
            AUTH_NO_SESSION: "Nenhuma sessão ativa.",
            AUTH_SESSION_EXPIRED:
                "Sua sessão atingiu o tempo máximo. Entre novamente.",
            USERS_NOT_FOUND: "Usuário não encontrado.",
            USERS_DELETE_AUTH_FAILED:
                "Não foi possível bloquear o acesso deste usuário, então ele não foi arquivado. Tente de novo em instantes.",
            USERS_SELF_LOCKOUT_FORBIDDEN:
                "Você não pode desativar, arquivar nem tirar o acesso de administrador da sua própria conta.",
            ACCOUNT_NOTHING_TO_UPDATE: "Nada para atualizar.",
            ACCOUNT_AVATAR_INVALID:
                "A imagem informada não pode ser usada como foto de perfil.",
            ACCOUNT_CURRENT_PASSWORD_INVALID: "A senha atual está incorreta.",
            ACCOUNT_PASSWORD_UNSUPPORTED:
                "Esta conta não usa senha. Entre pelo provedor de acesso original.",
            ACCOUNT_UPDATE_FAILED:
                "Não foi possível salvar a sua conta. Tente de novo.",
            AUTH_SESSIONS_NOT_REVOKED:
                'A alteração foi salva, mas não conseguimos encerrar as outras sessões desta conta. Entre de novo e use "Sair de todos os dispositivos" em Segurança.',
            AUTH_SESSION_REVOKED:
                "Esta sessão foi encerrada. Entre novamente para continuar.",
            USERS_NOTHING_TO_UPDATE: "Nenhum dado para atualizar.",
            VALIDATION_FAILED: "Dados inválidos.",
            USERS_AUTH_EMAIL_ALREADY_IN_USE: "Este e-mail já está em uso.",
            USERS_AUTH_WEAK_PASSWORD: "Senha muito fraca.",
            AUTH_PASSWORD_TOO_SHORT:
                "A senha deve ter pelo menos 8 caracteres.",
            USERS_AUTH_INVALID_EMAIL: "E-mail inválido.",
            USERS_AUTH_RATE_LIMITED:
                "Muitas tentativas. Tente novamente em instantes.",
            USERS_AUTH_SIGN_UP_FAILED: "Não foi possível criar o usuário.",
            USERS_PROFILE_CREATE_FAILED:
                "Não foi possível salvar o perfil do usuário.",
            COMMON_PANEL_FORBIDDEN:
                "Esta ação não está disponível para o seu perfil.",
            ENTITY_NOT_FOUND: "Entidade não encontrada.",
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
            ENTITY_PHOTO_INVALID: "Imagem inválida para esta entidade.",
            HEALTH_DEPENDENCY_UNAVAILABLE:
                "O serviço está indisponível no momento.",
            PAGINATION_CURSOR_INVALID:
                "A navegação expirou. Recarregue a lista.",
            PAGINATION_INDEX_MISSING:
                "A listagem está indisponível no momento. Tente de novo em instantes.",
            SUMMARY_INDEX_MISSING:
                "O resumo está indisponível no momento. Tente de novo em instantes.",
            NOTIFICATION_NOT_FOUND: "Notificação não encontrada.",
            NOTIFICATIONS_INDEX_MISSING:
                "As notificações estão indisponíveis no momento. Tente de novo em instantes.",
        },
    },
};
