import { globalTranslations } from "@repo/internationalization/translations/global";
import { MAX_CYCLE_SPECS } from "@repo/kanban-contract";
import { describe, expect, it } from "vitest";
import {
    buildNewCycleFormSchema,
    NEW_CYCLE_DEFAULTS,
    toCreateCycleRequest,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(validations)/newCycleSchema";

const dictionary = globalTranslations["pt-br"];
const schema = buildNewCycleFormSchema(dictionary);

describe("new cycle form", () => {
    it("asks for at least one spec, with the dictionary's message", () => {
        const result = schema.safeParse(NEW_CYCLE_DEFAULTS);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe(
            "Escolha pelo menos uma spec."
        );
    });

    it("refuses more specs than a cycle takes", () => {
        const slugs = Array.from(
            { length: MAX_CYCLE_SPECS + 1 },
            (_, index) => `s${index}`
        );
        const result = schema.safeParse({ ...NEW_CYCLE_DEFAULTS, slugs });

        expect(result.error?.issues[0]?.message).toBe(
            `Um ciclo leva no máximo ${MAX_CYCLE_SPECS} specs.`
        );
    });

    it("sends the options the API expects, concurrency as a number", () => {
        expect(
            toCreateCycleRequest({
                slugs: ["b", "a"],
                until: "testing",
                concurrency: "2",
                onFailure: "stop",
            })
        ).toEqual({
            slugs: ["b", "a"],
            options: { until: "testing", concurrency: 2, onFailure: "stop" },
        });
    });
});
