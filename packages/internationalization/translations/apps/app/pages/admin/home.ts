export const adminHomePageTranslations = {
    "pt-br": {
        greeting: "Olá",
        subtitle: "Um resumo da base de usuários.",
        metrics: {
            total: {
                label: "Usuários",
                hint: "Perfis cadastrados na plataforma.",
            },
            admins: {
                label: "Administradores",
                hint: "Perfis com acesso ao painel admin.",
            },
            common: {
                label: "Usuários comuns",
                hint: "Perfis que operam o painel comum.",
            },
        },
        activity: {
            title: "Atividade",
            description: "Quem acessou o painel e há quanto tempo.",
            metrics: {
                active: {
                    label: "Ativos",
                    hint: "Acessaram nos últimos {days} dias. O registro tem precisão de {minutes} minutos.",
                },
                inactive: {
                    label: "Inativos",
                    hint: "Sem acesso há mais de {days} dias. Não inclui quem nunca acessou.",
                },
            },
            chart: {
                title: "Último acesso por faixa",
                description:
                    "Dias desde o último acesso. Cada perfil aparece em uma faixa só, a do acesso mais recente dele.",
            },
            buckets: {
                last7Days: "0-7d",
                from8To30Days: "8-30d",
                from31To90Days: "31-90d",
                over90Days: "+90d",
                never: "Nunca",
            },
            neverNotice:
                "{count} perfis ainda não têm registro de acesso. O registro de cada pessoa começa no próximo acesso dela.",
        },
    },
};
