"use client";

import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { cn } from "@repo/design-system/lib/utils";
import { getDictionary } from "@repo/internationalization/client";
import { useTheme } from "next-themes";
import { Button } from "./button";

type ModeToggleProps = {
  triggerProps?: React.ComponentProps<typeof Button>;
};

export const ModeToggle = ({ triggerProps }: ModeToggleProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const { dictionary } = getDictionary();
  const modeToggleCopy = dictionary.components.modeToggle;
  const trigger = triggerProps ?? {};

  return (
    <Button
      {...trigger}
      className={cn("shrink-0 text-foreground", trigger.className)}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      size={trigger.size ?? "icon"}
      type="button"
      variant={trigger.variant ?? "ghost"}
    >
      <MoonIcon className="dark:-rotate-90 h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:scale-0" />
      <SunIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      {/* resolvedTheme is undefined on the server, so the label follows the <html> class instead of JS state to avoid a hydration mismatch. */}
      <span className="sr-only dark:hidden">{modeToggleCopy.useDark}</span>
      <span className="sr-only hidden dark:inline">
        {modeToggleCopy.useLight}
      </span>
    </Button>
  );
};
