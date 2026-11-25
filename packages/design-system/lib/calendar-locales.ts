import type { Locale } from "@repo/internationalization/utils";
import type { DayPickerLocale } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";

export const calendarLocales = {
  "pt-br": ptBR,
} satisfies Record<Locale, DayPickerLocale>;
