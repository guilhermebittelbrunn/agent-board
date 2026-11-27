export const commonAccountPageTranslations = {
    "pt-br": {
        title: "Minha conta",
        subtitle: "Gerencie seus dados e suas preferências.",
        tabs: {
            profile: "Perfil",
            preferences: "Preferências",
        },
        sectionNav: {
            label: "Seções da conta",
        },
        sections: {
            profile: "Seus dados de exibição e o e-mail da conta.",
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
            preferencesUpdated: "Preferências atualizadas.",
            loadError: "Não foi possível carregar a sua conta.",
        },
    },
};
