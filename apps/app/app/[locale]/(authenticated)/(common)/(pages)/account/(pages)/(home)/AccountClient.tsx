"use client";

import { getDictionary } from "@repo/internationalization/client";
import { Suspense } from "react";
import { Container } from "@/shared/components/ui/Container";
import { Header } from "@/shared/components/ui/Header";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { useMyAccount } from "@/shared/hooks/useMyAccount";
import { AccountTabs } from "../../(components)/AccountTabs";

export function AccountClient() {
    const { dictionary } = getDictionary();
    const accountCopy = dictionary.apps.app.pages.common.account;
    const { data: account, isLoading, isError } = useMyAccount();

    return (
        <>
            <Header page={accountCopy.title} />
            <Container
                contentOnly
                header={
                    <PageHeader
                        description={accountCopy.subtitle}
                        title={accountCopy.title}
                    />
                }
                loadError={isError ? accountCopy.messages.loadError : null}
                loading={isLoading}
                width="narrow"
            >
                <Suspense fallback={null}>
                    <AccountTabs account={account} />
                </Suspense>
            </Container>
        </>
    );
}
