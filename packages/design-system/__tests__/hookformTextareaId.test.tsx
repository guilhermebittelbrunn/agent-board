import { HookFormTextarea } from "@repo/design-system/components/form/hookform";
import { Form } from "@repo/design-system/components/ui/form";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";

type Values = { markdown: string };

function Harness({ children }: { children: ReactNode }) {
    const form = useForm<Values>({ defaultValues: { markdown: "" } });
    return <Form {...form}>{children}</Form>;
}

afterEach(() => {
    cleanup();
});

describe("HookFormTextarea id", () => {
    it("falls back to the field name", () => {
        render(
            <Harness>
                <HookFormTextarea<Values> label="Comment" name="markdown" />
            </Harness>
        );

        expect(screen.getByLabelText("Comment").id).toBe("markdown");
    });

    it("keeps two fields with the same name tied to their own labels", () => {
        render(
            <>
                <Harness>
                    <HookFormTextarea<Values> label="Comment" name="markdown" />
                </Harness>
                <Harness>
                    <HookFormTextarea<Values>
                        id="edit-markdown"
                        label="Edit comment"
                        name="markdown"
                    />
                </Harness>
            </>
        );

        const comment = screen.getByLabelText("Comment");
        const edit = screen.getByLabelText("Edit comment");
        expect(edit.id).toBe("edit-markdown");
        expect(edit).not.toBe(comment);
    });
});
