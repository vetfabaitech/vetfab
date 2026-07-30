import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FormField } from "./FormField";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  error?: string;
}

/** FormField specialized with a show/hide toggle. The toggle is a real
 * <button type="button"> (never submits the form), keyboard-reachable, and
 * announces its current action via aria-label + aria-pressed rather than
 * relying on the icon alone. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { label, error, ...inputProps },
  ref
) {
  const [visible, setVisible] = useState(false);

  return (
    <FormField
      ref={ref}
      label={label}
      error={error}
      type={visible ? "text" : "password"}
      trailingAction={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="rounded-md p-1.5 text-neutral-400 transition-colors duration-150 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      }
      {...inputProps}
    />
  );
});
