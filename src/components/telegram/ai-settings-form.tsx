"use client";

import { useActionState } from "react";
import { mutateAiConsent } from "@/app/(protected)/settings/actions";

export function AiSettingsForm({ enabled, isDemo }: { enabled: boolean; isDemo: boolean }) {
  const [state, action, pending] = useActionState(mutateAiConsent, { ok: false, message: "" });
  return <form action={action} className="finance-form">
    <input type="hidden" name="operation" value={enabled ? "disable" : "enable"} />
    <fieldset disabled={pending || isDemo}>
      {!enabled && <label className="consent-label"><input type="checkbox" name="consent" value="yes" required /> <span>Saya berumur 18 tahun ke atas, menggunakan aplikasi ini di Malaysia dan bersetuju menghantar mesej serta nama kategori kepada Google. Saya tidak akan menghantar maklumat sensitif, sulit atau peribadi.</span></label>}
      <button className="button" type="submit">{pending ? "Menyimpan…" : enabled ? "Matikan AI" : "Hidupkan AI dengan persetujuan"}</button>
    </fieldset>
    {isDemo && <p>Akaun demo tidak boleh menggunakan AI.</p>}
    {state.message && <p role={state.ok ? "status" : "alert"} className={state.ok ? "form-success" : "form-error"}>{state.message}</p>}
  </form>;
}
