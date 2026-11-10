"use client"

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react"
import type { Control, UseFormRegister } from "react-hook-form"
import { useFieldArray } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TaskFormInput, TaskFormValues } from "../schemas"

/** The "What to do" list: add, remove and reorder steps. */
export function StepsEditor({
  control,
  register,
}: {
  control: Control<TaskFormInput, unknown, TaskFormValues>
  register: UseFormRegister<TaskFormInput>
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name: "steps" })

  return (
    <div className="flex flex-col gap-2">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No steps yet. Add the instructions a VA needs to do this without asking.
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {fields.map((field, index) => (
          <li key={field.id} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
              {index + 1}.
            </span>
            <Input
              aria-label={`Step ${index + 1}`}
              placeholder="Log in to the client's Yelp account from the vault"
              {...register(`steps.${index}.text` as const)}
            />
            <div className="flex shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Move step up"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Move step down"
                disabled={index === fields.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove step"
                onClick={() => remove(index)}
              >
                <X />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {fields.length < 30 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => append({ text: "" })}
        >
          <Plus />
          Add step
        </Button>
      )}
    </div>
  )
}
