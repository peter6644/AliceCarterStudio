"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <div className="gate">
      <form action={action} className="gatecard" style={{ textAlign: "left" }}>
        <img className="glogo" src="/logo.jpg" alt="" />
        <div className="gtitle" style={{ textAlign: "center", marginBottom: 20 }}>Alice Carter Studio</div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <button className="gowner" type="submit" disabled={pending} style={{ width: "100%" }}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
