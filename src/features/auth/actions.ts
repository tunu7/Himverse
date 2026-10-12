"use server";

import { redirect } from "next/navigation";

import { getPublicEnv } from "@/lib/env";
import { type ActionResult, ok, toLoggedFailure } from "@/lib/errors";
import { safeRedirectPath } from "@/lib/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseInput } from "@/lib/validation";
import { signInError, signUpError } from "@/server/auth/auth-errors";

import { signInSchema, signUpSchema } from "./schemas";

export type SignUpResult = ActionResult<{ needsEmailConfirmation: true }> | null;
export type SignInResult = ActionResult<never> | null;

export async function signUp(_prev: SignUpResult, formData: FormData): Promise<SignUpResult> {
  let destination: string;
  try {
    const input = parseInput(signUpSchema, formData);
    const supabase = await createSupabaseServerClient();
    const next = safeRedirectPath(input.next);
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        // Used only to prefill profiles.display_name; never for authorization.
        data: { display_name: input.displayName },
        emailRedirectTo: `${getPublicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      throw signUpError(error);
    }
    if (!data.session) {
      return ok({ needsEmailConfirmation: true });
    }
    destination = next;
  } catch (error) {
    return toLoggedFailure("auth.sign_up_failed", error);
  }
  redirect(destination);
}

export async function signIn(_prev: SignInResult, formData: FormData): Promise<SignInResult> {
  let destination: string;
  try {
    const input = parseInput(signInSchema, formData);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) {
      throw signInError(error);
    }
    destination = safeRedirectPath(input.next);
  } catch (error) {
    return toLoggedFailure("auth.sign_in_failed", error);
  }
  redirect(destination);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
