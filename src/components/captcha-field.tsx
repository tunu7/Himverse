"use client";

import { useEffect, useRef, useState } from "react";

import { CAPTCHA_FIELD } from "@/lib/captcha";
import { getTurnstileSiteKey } from "@/lib/env";

// Cloudflare Turnstile (ADR-0010), rendered explicitly so it works after
// client-side navigation. The widget writes its token into a hidden input named
// `captchaToken` inside the form, which the Server Action passes to Supabase Auth.
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      "response-field-name": string;
      theme: "auto";
      size: "flexible";
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptPromise: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing"));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * The security check for auth forms. Renders nothing when no site key is
 * configured. `resetKey` should change after every submission: tokens are
 * single-use, so the widget issues a fresh one.
 */
export function CaptchaField({ resetKey }: { resetKey?: unknown }) {
  const siteKey = getTurnstileSiteKey();
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: Turnstile; id: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let cancelled = false;
    const element = container.current;
    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        const id = api.render(element, {
          sitekey: siteKey,
          "response-field-name": CAPTCHA_FIELD,
          theme: "auto",
          size: "flexible",
          "error-callback": () => setFailed(true),
        });
        widget.current = { api, id };
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === undefined || !widget.current) return;
    widget.current.api.reset(widget.current.id);
    setFailed(false);
  }, [resetKey]);

  if (!siteKey) return null;
  return (
    <div className="flex flex-col gap-1">
      <div ref={container} className="min-h-[65px]" aria-label="Security check" />
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          The security check couldn&apos;t load. Check your connection and reload the page.
        </p>
      ) : null}
    </div>
  );
}
