"use client";

import { useActionState, useId, useState } from "react";
import { mutateTelegram } from "@/app/(protected)/settings/actions";

export function TelegramSettingsForm({ linked, configured }: { linked: boolean; configured: boolean }) {
  const [state, action, pending] = useActionState(mutateTelegram, { ok: false, message: "" });
  const [confirming, setConfirming] = useState(false);
  const feedbackId = useId();
  return <div className="finance-form">
    <form action={action} className="finance-form" aria-busy={pending} aria-describedby={state.message ? feedbackId : undefined}>
      <input type="hidden" name="operation" value={linked ? "unlink" : "link"} />
      <fieldset disabled={pending}>
        {linked ? confirming ? <>
          <p>Putuskan sambungan Telegram? Semua cadangan belum disahkan dan pautan lama akan dibatalkan.</p>
          <input type="hidden" name="confirmUnlink" value="yes" />
          <button className="danger" type="submit">{pending ? "Memutuskan…" : "Sahkan putuskan sambungan"}</button>
          <button type="button" onClick={() => setConfirming(false)}>Batal</button>
        </> : <button className="danger" type="button" onClick={() => setConfirming(true)}>Putuskan sambungan Telegram</button> :
          <button className="button" type="submit" disabled={!configured}>{pending ? "Menyediakan pautan…" : "Jana pautan Telegram"}</button>}
      </fieldset>
    </form>
    {state.message && <p id={feedbackId} role={state.ok ? "status" : "alert"} className={state.ok ? "form-success" : "form-error"}>{state.message}</p>}
    {!linked && state.linkUrl && <div>
      <p><a className="text-link" href={state.linkUrl} target="_blank" rel="noopener noreferrer">Buka bot untuk pautkan Telegram</a></p>
      <p>Tekan Mula / Start di Telegram. Salin kod yang dihantar oleh bot dan masukkannya di sini.</p>
      {state.expiresAt && <p>Tamat pada {new Intl.DateTimeFormat("ms-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }).format(new Date(state.expiresAt))} waktu Malaysia.</p>}
      <p>Jangan kongsi pautan ini. Menjana pautan baharu membatalkan pautan sebelumnya.</p>
    </div>}
    {!linked && configured && <form action={action} className="finance-form" aria-busy={pending} aria-describedby={state.message ? feedbackId : undefined}>
      <input type="hidden" name="operation" value="confirmLink" />
      <fieldset disabled={pending}>
        <label htmlFor={`${feedbackId}-code`}>Kod pengesahan daripada bot</label>
        <input id={`${feedbackId}-code`} name="code" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} maxLength={16} required />
        <button className="button" type="submit">Sahkan sambungan Telegram</button>
      </fieldset>
    </form>}
  </div>;
}
