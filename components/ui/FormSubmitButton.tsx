"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import Button from "@/components/ui/Button";

type FormSubmitButtonProps = Omit<ComponentProps<typeof Button>, "type"> & {
  pendingLabel?: string;
};

export default function FormSubmitButton({
  children,
  pendingLabel = "Working...",
  disabled,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending} {...props}>
      {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}