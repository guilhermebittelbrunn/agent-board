import { commonAccountPageTranslations } from "./account";
import { commonBoardsPageTranslations } from "./boards";
import { globalErrorPageTranslations } from "./globalError";
import { notFoundPageTranslations } from "./notFound";
import { commonRoutesTranslations } from "./routes";

export const commonTranslations = {
    "pt-br": {
        routes: commonRoutesTranslations["pt-br"],
        notFound: notFoundPageTranslations["pt-br"],
        globalError: globalErrorPageTranslations["pt-br"],
        account: commonAccountPageTranslations["pt-br"],
        boards: commonBoardsPageTranslations["pt-br"],
    },
};
