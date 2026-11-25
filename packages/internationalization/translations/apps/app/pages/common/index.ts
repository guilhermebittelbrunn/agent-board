import { commonAccountPageTranslations } from "./account";
import { commonEntitiesPageTranslations } from "./entities";
import { globalErrorPageTranslations } from "./globalError";
import { commonHomePageTranslations } from "./home";
import { notFoundPageTranslations } from "./notFound";
import { commonRoutesTranslations } from "./routes";

export const commonTranslations = {
    "pt-br": {
        routes: commonRoutesTranslations["pt-br"],
        notFound: notFoundPageTranslations["pt-br"],
        globalError: globalErrorPageTranslations["pt-br"],
        home: commonHomePageTranslations["pt-br"],
        entities: commonEntitiesPageTranslations["pt-br"],
        account: commonAccountPageTranslations["pt-br"],
    },
};
