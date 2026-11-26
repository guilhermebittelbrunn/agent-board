import { globalTranslations } from "@repo/internationalization/translations/global";
import { describe, expect, it } from "vitest";
import {
    buildStageSettingsSchema,
    stageSettingsFormValues,
    toStageSettingsRequest,
} from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(validations)/stageSettingsSchema";
import { RUN_CONFIG } from "./runCardFixtures";

const dictionary = globalTranslations["pt-br"];
const schema = buildStageSettingsSchema(dictionary);
const valuesWith = (wipLimit: string) => ({
    stages: [{ key: "analyze", wipLimit, approvalGate: false }],
});

describe("stage settings form", () => {
    it("accepts an empty limit or a whole number from 1 to 20", () => {
        for (const wipLimit of ["", "1", "20", " 3 "]) {
            expect(schema.safeParse(valuesWith(wipLimit)).success).toBe(true);
        }
        for (const wipLimit of ["0", "21", "1.5", "-1", "abc"]) {
            const result = schema.safeParse(valuesWith(wipLimit));
            expect(result.success).toBe(false);
            expect(result.error?.issues[0]?.message).toBe(
                "Use um número inteiro de 1 a 20."
            );
        }
    });

    it("round-trips the board's settings, empty meaning no limit", () => {
        const values = stageSettingsFormValues(RUN_CONFIG, {
            analyze: { wipLimit: 2, approvalGate: true },
        });

        expect(values.stages.map((stage) => stage.key)).toEqual([
            "analyze",
            "develop",
            "review",
        ]);
        expect(toStageSettingsRequest(values)).toEqual({
            stages: {
                analyze: { wipLimit: 2, approvalGate: true },
                develop: { wipLimit: null, approvalGate: false },
                review: { wipLimit: null, approvalGate: false },
            },
        });
    });
});
