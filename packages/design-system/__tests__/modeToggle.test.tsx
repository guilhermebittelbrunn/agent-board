import { ModeToggle } from "@repo/design-system/components/ui/mode-toggle";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { setThemeMock, themeState } = vi.hoisted(() => ({
    setThemeMock: vi.fn(),
    themeState: { theme: "light", resolvedTheme: "light" },
}));

vi.mock("next-themes", () => ({
    useTheme: () => ({ ...themeState, setTheme: setThemeMock }),
}));

afterEach(() => {
    cleanup();
    setThemeMock.mockReset();
});

describe("ModeToggle", () => {
    it.each([
        [{ theme: "light", resolvedTheme: "light" }, "dark"],
        [{ theme: "dark", resolvedTheme: "dark" }, "light"],
        [{ theme: "system", resolvedTheme: "dark" }, "light"],
        [{ theme: "system", resolvedTheme: "light" }, "dark"],
    ])("com %o, um clique escolhe %s", (state, expected) => {
        Object.assign(themeState, state);
        render(<ModeToggle />);

        fireEvent.click(screen.getByRole("button"));

        expect(setThemeMock).toHaveBeenCalledTimes(1);
        expect(setThemeMock).toHaveBeenCalledWith(expected);
    });

    it("alterna sem abrir menu", () => {
        render(<ModeToggle />);

        fireEvent.click(screen.getByRole("button"));

        expect(screen.queryByRole("menu")).toBeNull();
        expect(screen.queryByRole("menuitem")).toBeNull();
    });

    it("mantém o estilo do chamador e não submete formulário", () => {
        render(<ModeToggle triggerProps={{ className: "rounded-full" }} />);

        const toggle = screen.getByRole("button");
        expect(toggle.className).toContain("rounded-full");
        expect(toggle.getAttribute("type")).toBe("button");
    });
});
