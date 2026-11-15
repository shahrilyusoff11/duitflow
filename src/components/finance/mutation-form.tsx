"use client";

import { useActionState, useState } from "react";
import { mutateFinance } from "@/app/(protected)/actions";

export function MutationForm({ operation, id, label = "Simpan", destructive = false, children }: {
  operation: string; id?: string; label?: string; destructive?: boolean; children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(mutateFinance, { message: "", ok: false });
  const [confirmed, setConfirmed] = useState(false);
  return <form action={action} className="finance-form">
    <input type="hidden" name="operation" value={operation} />
    {id && <input type="hidden" name="id" value={id} />}
    <fieldset disabled={pending}>
      {children}
      {destructive && !confirmed ? <button type="button" className="danger" onClick={() => setConfirmed(true)}>{label}</button> : <>
        {destructive && <p>Padam rekod ini secara kekal? <button type="button" onClick={() => setConfirmed(false)}>Batal</button></p>}
        <button className={destructive ? "danger" : "button"} type="submit">{pending ? "Menyimpan…" : destructive ? "Sahkan padam" : label}</button>
      </>}
    </fieldset>
    {state.message && <p role={state.ok ? "status" : "alert"} className={state.ok ? "form-success" : "form-error"}>{state.message}</p>}
  </form>;
}
