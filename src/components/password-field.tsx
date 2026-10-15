"use client";

import { useState } from "react";

import { inputClass } from "@/components/form-feedback";
import { passwordStrength } from "@/lib/password-strength";

const BAR_COLOURS = ["bg-danger", "bg-danger", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

/**
 * Password input with a show/hide toggle and, for new passwords, a strength
 * meter. Works without JavaScript as a plain password input.
 */
export function PasswordField({
  name,
  label,
  autoComplete,
  showStrength = false,
  minLength,
}: {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  showStrength?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const strength = passwordStrength(value);
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={72}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${inputClass} w-full pr-16`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-controls={id}
          aria-pressed={visible}
          className="absolute inset-y-0 right-2 my-auto h-8 rounded-full px-2.5 text-xs font-medium text-muted hover:bg-surface-muted hover:text-fg"
        >
          {visible ? "Hide" : "Show"}
          <span className="sr-only"> password</span>
        </button>
      </div>
      {showStrength && value ? (
        <div className="flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={`h-1 flex-1 rounded-full ${
                  strength.score >= step ? BAR_COLOURS[strength.score] : "bg-line"
                }`}
              />
            ))}
          </div>
          <span className="w-16 text-right text-xs text-muted" data-testid="password-strength">
            {strength.label}
          </span>
        </div>
      ) : null}
    </div>
  );
}
