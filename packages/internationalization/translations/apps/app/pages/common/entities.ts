export const commonEntitiesPageTranslations = {
    "pt-br": {
        list: {
            searchPlaceholder: "Buscar por nome ou descrição",
            enabledToggle: "Entidade ativa: {name}",
            empty: "Nenhuma entidade cadastrada.",
            columns: {
                photo: "Foto",
                name: "Nome",
                type: "Tipo",
                enabled: "Ativo",
                createdAt: "Criado em",
                actions: "Ações",
            },
            typeLabels: {
                franchise: "Franquia",
                customer: "Cliente",
                collaborator: "Colaborador",
            },
            enabledLabels: {
                yes: "Sim",
                no: "Não",
            },
        },
        form: {
            name: "Nome",
            description: "Descrição",
            type: "Tipo",
            photo: "Foto (URL)",
            photoPlaceholder: "https://",
            photoHint:
                "Informe a URL pública da imagem. Em produção, substitua por upload para storage.",
            genre: "Gênero",
            genreUnset: "Não informar",
            birthdate: "Data de nascimento",
            enabled: "Ativo",
            createdAt: "Criado em",
            save: "Salvar",
            genreOptions: {
                male: "Masculino",
                female: "Feminino",
                other: "Outro",
            },
            photoUpload: {
                label: "Foto",
                choose: "Escolher imagem",
                replace: "Trocar imagem",
                remove: "Remover imagem",
                uploading: "Enviando…",
                hint: "JPG, PNG ou WebP, até 4 MB.",
                alt: "Pré-visualização da foto",
                errors: {
                    tooLarge: "A imagem excede 4 MB.",
                    typeNotAllowed:
                        "Formato não aceito. Escolha JPG, PNG ou WebP.",
                    failed: "Não foi possível enviar a imagem. Tente de novo.",
                },
            },
            validation: {
                nameRequired: "Informe o nome.",
                nameMax: "O nome pode ter no máximo 255 caracteres.",
                descriptionMax:
                    "A descrição pode ter no máximo 10.000 caracteres.",
                typeInvalid: "Selecione um tipo válido.",
                photoReference:
                    "Envie uma imagem ou informe uma URL válida (http ou https).",
                photoMax: "A URL da foto é longa demais.",
                genreMax: "Valor inválido para gênero.",
                birthdateInvalid: "Informe uma data válida (AAAA-MM-DD).",
            },
        },
        messages: {
            created: "Entidade criada com sucesso.",
            updated: "Entidade atualizada com sucesso.",
            deleted: "Entidade removida com sucesso.",
            loadError: "Não foi possível carregar a entidade.",
        },
    },
};
