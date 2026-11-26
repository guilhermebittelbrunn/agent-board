"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useId } from "react";
import type * as React from "react";
import { Badge } from "./badge";
import { Label } from "./label";
import { RadioGroup, RadioGroupItem } from "./radio-group";

export type RadioOption = {
  value: string;
  label: string;
  /** Secondary line under the label. */
  description?: string;
  /** Short tag next to the label, e.g. to flag a suggested option. */
  badge?: string;
};

export type RadioGroupInputProps = {
  label?: string;
  error?: string;
  required?: boolean;
  options: RadioOption[];
  className?: string;
  orientation?: "vertical" | "horizontal";
} & React.ComponentProps<typeof RadioGroup>;

function optionDomId(rootId: string, value: string): string {
  const safe = value.replace(/\W/g, "_");
  return `${rootId}-${safe}`;
}

export function RadioGroupInput({
  label,
  error,
  required = false,
  options,
  className,
  orientation = "vertical",
  ...radioGroupProps
}: RadioGroupInputProps) {
  const reactId = useId();
  const rootId = reactId.replace(/:/g, "");
  const labelId = useId();

  return (
    <div className="grid gap-2">
      {label ? (
        <Label id={labelId} invalid={Boolean(error)} required={required}>
          {label}
        </Label>
      ) : null}
      <RadioGroup
        aria-labelledby={label ? labelId : undefined}
        className={cn(
          orientation === "horizontal"
            ? "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4"
            : "flex flex-col gap-3",
          className
        )}
        {...radioGroupProps}
      >
        {options.map((option) => {
          const htmlId = optionDomId(rootId, option.value);
          return (
            <label
              className={cn(
                "flex cursor-pointer gap-2",
                option.description ? "items-start" : "items-center"
              )}
              htmlFor={htmlId}
              key={option.value}
            >
              <RadioGroupItem
                aria-invalid={Boolean(error)}
                className={cn(
                  option.description ? "mt-0.5" : "",
                  error
                    ? "border-destructive aria-invalid:border-destructive"
                    : ""
                )}
                id={htmlId}
                value={option.value}
              />
              {option.description || option.badge ? (
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    {option.label}
                    {option.badge ? (
                      <Badge variant="secondary">{option.badge}</Badge>
                    ) : null}
                  </span>
                  {option.description ? (
                    <span className="text-muted-foreground text-sm">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-sm">{option.label}</span>
              )}
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
