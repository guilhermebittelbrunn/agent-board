export const adminUsersPageTranslations = {
    "pt-br": {
        list: {
            searchPlaceholder: "Buscar por nome ou e-mail",
            statusToggle: "Usuário ativo: {name}",
            selfStatusLocked: "Você não pode desativar a sua própria conta.",
            refresh: "Atualizar",
            empty: "Nenhum usuário encontrado.",
            columns: {
                photo: "Foto",
                name: "Nome",
                email: "E-mail",
                type: "Tipo",
                status: "Ativo",
                lastAccess: "Último acesso",
                actions: "Ações",
            },
            lastAccess: {
                never: "Nunca acessou",
                approximate:
                    "Valor aproximado, vindo do provedor de autenticação",
            },
            typeLabels: {
                admin: "Administrador",
                common: "Usuário",
            },
            statusLabels: {
                active: "Ativo",
                disabled: "Desativado",
            },
            archive: {
                action: "Arquivar",
                confirmTitle: "Arquivar usuário",
                confirmDescription:
                    "O usuário sai da listagem e perde o acesso, mas o cadastro é preservado e o e-mail continua ocupado. Se houver assinatura ativa, ela é cancelada na hora.",
            },
        },
        form: {
            email: "E-mail",
            password: "Senha",
            confirmPassword: "Confirmar senha",
            displayName: "Nome de exibição",
            type: "Tipo de usuário",
            typeSelfLocked:
                "Você não pode tirar o seu próprio acesso de administrador.",
            save: "Salvar",
            cancel: "Cancelar",
            back: "Voltar",
            validation: {
                emailInvalid: "Informe um e-mail válido.",
                passwordMin: "A senha deve ter pelo menos 8 caracteres.",
                passwordMismatch: "As senhas não coincidem.",
            },
        },
        messages: {
            created: "Usuário criado com sucesso.",
            updated: "Usuário atualizado com sucesso.",
            deleted: "Usuário arquivado com sucesso.",
            loadError: "Não foi possível carregar o usuário.",
        },
    },
};
