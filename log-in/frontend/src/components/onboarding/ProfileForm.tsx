import { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { profileSchema, type ProfileFormValues } from "@/lib/validation";
import { FormField } from "@/components/auth/FormField";
import { ErrorAlert } from "@/components/auth/ErrorAlert";
import { UsernameField } from "./UsernameField";
import { COUNTRIES } from "@/lib/countries";
import { completeProfile, RealAuthError, type Profile } from "@/lib/realAuth";
import { cn } from "@/lib/utils";

interface ProfileFormProps {
  defaultDisplayName: string;
  onSuccess: (profile: Profile) => void;
}

const selectClassName = cn(
  "w-full rounded-control border border-neutral-200 bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 shadow-sm transition-colors duration-150",
  "focus:outline-none focus-visible:border-brand-500 focus-visible:shadow-focus-glow",
  "disabled:cursor-not-allowed disabled:opacity-60",
  "hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:border-neutral-600"
);

function Select({
  label,
  id,
  children,
  ...props
}: { label: string; id: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </label>
      <select id={id} className={selectClassName} {...props}>
        {children}
      </select>
    </div>
  );
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function ProfileForm({ defaultDisplayName, onSuccess }: ProfileFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const defaultTimezone = useMemo(detectTimezone, []);

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    mode: "onBlur",
    defaultValues: {
      username: "",
      displayName: defaultDisplayName,
      bio: "",
      country: "",
      timezone: defaultTimezone,
      preferredHdl: "verilog",
      theme: "system",
      defaultVisibility: "private",
    },
  });

  const bioValue = watch("bio") ?? "";

  const onSubmit = async (values: ProfileFormValues) => {
    setFormError(null);
    try {
      const profile = await completeProfile({
        username: values.username,
        displayName: values.displayName,
        bio: values.bio ?? "",
        country: values.country ?? "",
        timezone: values.timezone ?? defaultTimezone,
        preferredHdl: values.preferredHdl,
        theme: values.theme,
        defaultVisibility: values.defaultVisibility,
      });
      onSuccess(profile);
    } catch (err) {
      setFormError(err instanceof RealAuthError ? err.message : "Something went wrong. Please try again.");
    }
  };

  const busy = isSubmitting;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />

      <Controller
        name="username"
        control={control}
        render={({ field }) => (
          <UsernameField
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            formatError={errors.username?.message}
            onAvailabilityChange={setUsernameAvailable}
            disabled={busy}
          />
        )}
      />

      <FormField
        label="Display name"
        disabled={busy}
        error={errors.displayName?.message}
        {...register("displayName")}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="bio" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Bio <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <span className="text-xs text-neutral-400">{bioValue.length}/160</span>
        </div>
        <textarea
          id="bio"
          rows={2}
          maxLength={160}
          disabled={busy}
          placeholder="RTL designer building things that go beep."
          className={cn(selectClassName, "resize-none placeholder:text-neutral-400")}
          {...register("bio")}
        />
        {errors.bio?.message && (
          <p role="alert" className="text-[13px] font-medium text-red-600 dark:text-red-400">
            {errors.bio.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Country" id="country" disabled={busy} {...register("country")}>
          <option value="">Prefer not to say</option>
          {COUNTRIES.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </Select>

        <FormField label="Timezone" id="timezone" disabled={busy} {...register("timezone")} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Preferred HDL" id="preferredHdl" disabled={busy} {...register("preferredHdl")}>
          <option value="verilog">Verilog</option>
          <option value="systemverilog">SystemVerilog</option>
          <option value="vhdl">VHDL</option>
          <option value="mixed">Mixed</option>
        </Select>

        <Select label="Theme" id="theme" disabled={busy} {...register("theme")}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </Select>
      </div>

      <Select label="Default project visibility" id="defaultVisibility" disabled={busy} {...register("defaultVisibility")}>
        <option value="private">Private</option>
        <option value="public">Public</option>
      </Select>

      <button
        type="submit"
        disabled={busy || !usernameAvailable}
        aria-busy={isSubmitting}
        className={cn(
          "mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-control bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150",
          "hover:bg-brand-700 hover:shadow-md active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950",
          "disabled:pointer-events-none disabled:opacity-60"
        )}
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin-smooth" aria-hidden="true" />}
        {isSubmitting ? "Creating your workspace…" : "Create Workspace"}
      </button>
    </form>
  );
}
