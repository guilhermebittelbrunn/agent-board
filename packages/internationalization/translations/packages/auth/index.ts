export const authTranslations = {
    "pt-br": {
        provider: {
            onSuccess: "Login realizado com sucesso!",
            session: {
                expired: "Sua sessão expirou. Entre novamente para continuar.",
                revoked:
                    "Esta sessão foi encerrada. Entre novamente para continuar.",
                notEstablished:
                    "Não foi possível iniciar sua sessão. Tente entrar novamente.",
            },
            firebase: {
                error: {
                    "auth/email-already-in-use": "Este e-mail já está em uso.",
                    "auth/invalid-email": "E-mail inválido.",
                    "auth/operation-not-allowed": "Operação não permitida.",
                    "auth/weak-password": "A senha é muito fraca.",
                    "auth/user-disabled": "Esta conta foi desativada.",
                    "auth/user-not-found": "Usuário não encontrado.",
                    "auth/wrong-password": "Senha incorreta.",
                    "auth/invalid-credential":
                        "Credenciais inválidas. Verifique e-mail e senha.",
                    "auth/too-many-requests":
                        "Muitas tentativas. Tente novamente mais tarde.",
                    "auth/network-request-failed":
                        "Erro de conexão. Verifique sua internet.",
                    "auth/popup-closed-by-user": "Login cancelado.",
                    "auth/cancelled-popup-request": "Login cancelado.",
                    "auth/credential-already-in-use":
                        "Esta conta Google já está vinculada a outra conta.",
                    "auth/provider-already-linked":
                        "Este método de login já está vinculado.",
                    "auth/popup-blocked":
                        "O navegador bloqueou a janela de login. Permita pop-ups e tente de novo.",
                    "auth/user-mismatch":
                        "Escolha a mesma conta Google vinculada a esta conta.",
                    "auth/unauthorized-domain":
                        "Este endereço não está autorizado para login com Google.",
                },
            },
        },
    },
};
