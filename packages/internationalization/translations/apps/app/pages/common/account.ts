export const commonAccountPageTranslations = {
    "pt-br": {
        title: "Minha conta",
        subtitle: "Gerencie seus dados, sua senha e suas preferências.",
        tabs: {
            profile: "Perfil",
            security: "Segurança",
            preferences: "Preferências",
        },
        sectionNav: {
            label: "Seções da conta",
        },
        sections: {
            profile: "Seus dados de exibição e o e-mail da conta.",
            security: "A senha com que você entra na conta.",
            preferences: "Como o painel aparece para você.",
        },
        profile: {
            details: {
                title: "Dados pessoais",
                description: "Nome, telefone e foto que a equipe vê.",
            },
            emailDescription:
                "Endereço usado para entrar e para receber os avisos da conta.",
            displayName: "Nome de exibição",
            displayNamePlaceholder: "Como você quer ser chamado",
            phone: "Telefone",
            phonePlaceholder: "+55 51 99999-0000",
            email: "E-mail",
            avatar: "Foto de perfil (URL)",
            avatarPlaceholder: "https://exemplo.com/foto.jpg",
            avatarHint:
                "Informe a URL pública da imagem. Com o storage configurado, o envio de arquivo aparece aqui.",
            save: "Salvar",
            avatarUpload: {
                label: "Foto de perfil",
                choose: "Escolher imagem",
                replace: "Trocar imagem",
                remove: "Remover imagem",
                uploading: "Enviando…",
                hint: "JPG, PNG ou WebP, até 4 MB.",
                alt: "Pré-visualização da foto de perfil",
                errors: {
                    tooLarge: "A imagem excede 4 MB.",
                    typeNotAllowed:
                        "Formato não aceito. Escolha JPG, PNG ou WebP.",
                    failed: "Não foi possível enviar a imagem. Tente de novo.",
                },
            },
            validation: {
                displayNameRequired: "Informe o nome de exibição.",
                displayNameMax: "O nome pode ter no máximo 120 caracteres.",
                phoneInvalid:
                    "Informe um telefone válido (dígitos, espaços, +, - e parênteses).",
                avatarReference: "Informe uma URL de imagem válida.",
            },
        },
        security: {
            passwordTitle: "Senha",
            description:
                "Ao trocar a senha, todas as sessões são encerradas e você precisa entrar de novo.",
            currentPassword: "Senha atual",
            newPassword: "Nova senha",
            confirmPassword: "Confirmar nova senha",
            save: "Alterar senha",
            passwordUnavailable:
                "Esta conta entra pelo GitHub e não tem senha para trocar.",
            validation: {
                required: "Informe a senha.",
                min: "A senha deve ter ao menos 6 caracteres.",
                newPasswordMin: "A nova senha deve ter ao menos 8 caracteres.",
                mismatch: "As senhas não coincidem.",
            },
        },
        preferences: {
            title: "Tema",
            description:
                "O tema acompanha a sua conta em qualquer dispositivo.",
            theme: "Tema",
            themeOptions: {
                light: "Claro",
                dark: "Escuro",
                system: "Sistema",
            },
            save: "Salvar preferências",
        },
        messages: {
            profileUpdated: "Perfil atualizado.",
            passwordChanged: "Senha alterada. Entre novamente para continuar.",
            preferencesUpdated: "Preferências atualizadas.",
            loadError: "Não foi possível carregar a sua conta.",
        },
    },
};
