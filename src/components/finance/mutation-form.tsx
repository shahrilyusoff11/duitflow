"use client";

import { Fragment, useActionState, useId, useState } from "react";
import { mutateFinance } from "@/app/(protected)/actions";

export function MutationForm({ operation, id, version, label = "Simpan", destructive = false, children }: {
  operation: string; id?: string; version?: number; label?: string; destructive?: boolean; children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(mutateFinance, { message: "", ok: false });
  const [confirmed, setConfirmed] = useState(false);
  const feedbackId = useId();
  const [fieldsVersion, setFieldsVersion] = useState(0);
  const transactionEntry = operation === "createTransaction" || operation === "updateTransaction";
  return <form action={action} onReset={transactionEntry ? () => setFieldsVersion((version) => version + 1) : undefined} className={children ? "finance-form entry-form" : "finance-form"} aria-busy={pending} aria-describedby={state.message ? feedbackId : undefined}>
    <input type="hidden" name="operation" value={operation} />
    {id && <input type="hidden" name="id" value={id} />}
    {version !== undefined && <input type="hidden" name="version" value={version} />}
    <fieldset disabled={pending}>
      <Fragment key={fieldsVersion}>{children}</Fragment>
      {destructive && !confirmed ? <button type="button" className="danger" onClick={() => setConfirmed(true)}>{label}</button> : <>
        {destructive && <p>Padam rekod ini secara kekal? <button type="button" onClick={() => setConfirmed(false)}>Batal</button></p>}
        <button className={destructive ? "danger" : "button"} type="submit">{pending ? destructive ? "Memadam…" : "Menyimpan…" : destructive ? "Sahkan padam" : label}</button>
      </>}
    </fieldset>
    {state.message && <p id={feedbackId} role={state.ok ? "status" : "alert"} className={state.ok ? "form-success" : "form-error"}>{state.message}</p>}
  </form>;
}
