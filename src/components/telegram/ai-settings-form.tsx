"use client";

import { useActionState, useId } from "react";
import { mutateAiConsent } from "@/app/(protected)/settings/actions";

export function AiSettingsForm({ enabled, isDemo }: { enabled: boolean; isDemo: boolean }) {
  const [state, action, pending] = useActionState(mutateAiConsent, { ok: false, message: "" });
  const feedbackId = useId();
  return <form action={action} className="finance-form" aria-busy={pending} aria-describedby={state.message ? feedbackId : undefined}>
    <input type="hidden" name="operation" value={enabled ? "disable" : "enable"} />
    <fieldset disabled={pending || isDemo}>
      {!enabled && <label className="consent-label"><input type="checkbox" name="consent" value="deepseek-chat" required /> <span>Saya bersetuju menghantar mesej Telegram yang telah ditapis kepada DeepSeek untuk memilih fungsi DuitFlow.</span></label>}
      <button className="button" type="submit">{pending ? "Menyimpan…" : enabled ? "Matikan AI" : "Hidupkan AI dengan persetujuan"}</button>
    </fieldset>
    {isDemo && <p>Akaun demo tidak boleh menggunakan AI.</p>}
    {state.message && <p id={feedbackId} role={state.ok ? "status" : "alert"} className={state.ok ? "form-success" : "form-error"}>{state.message}</p>}
  </form>;
}
