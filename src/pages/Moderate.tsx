import { useState, useEffect, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseModeration as sb } from "@/integrations/supabase/moderation-client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Confession = Database["public"]["Tables"]["confessions"]["Row"];

// The admin_* RPCs are not in the generated types (Functions is empty and can't be
// regenerated without DB access), so cast narrowly at the call sites.
type RpcResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;
const rpc = sb.rpc.bind(sb) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => RpcResult<unknown>;

const Moderate = () => {
  const { toast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const [rows, setRows] = useState<Confession[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Session bootstrap + magic-link redirect. This client (and only this client)
  // has detectSessionInUrl:true, so it parses the token off the /moderate URL.
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load pending rows once a session exists. A non-admin session gets 'not authorized'
  // from the RPC body (is_admin() check) — the data layer, not the route, is the guard.
  useEffect(() => {
    if (!session) {
      setRows([]);
      setNotAuthorized(false);
      return;
    }
    let cancelled = false;
    setLoadingRows(true);
    setNotAuthorized(false);
    rpc("admin_list_confessions", { _status: "pending" }).then(({ data, error }) => {
      if (cancelled) return;
      setLoadingRows(false);
      if (error) {
        setNotAuthorized(true);
        setRows([]);
        return;
      }
      setRows((data as Confession[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setSending(true);
    const { error } = await sb.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: `${window.location.origin}/moderate` },
    });
    setSending(false);
    if (error) {
      toast({ title: "Couldn't send link", description: error.message, variant: "destructive" });
      return;
    }
    setLinkSent(true);
  };

  const signOut = async () => {
    await sb.auth.signOut();
    setSession(null);
    setNotAuthorized(false);
    setRows([]);
    setLinkSent(false);
  };

  const setStatus = async (row: Confession, status: "approved" | "rejected") => {
    setBusyId(row.id);
    const { error } = await rpc("admin_set_status", { _id: row.id, _status: status });
    setBusyId(null);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast({
      title: status === "approved" ? "Approved" : "Rejected",
      description: `#${row.subject_number}`,
    });
  };

  // --- Render states --------------------------------------------------------

  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  // Logged out: email + magic link.
  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <form onSubmit={sendLink} className="w-full max-w-sm space-y-4">
          <h1 className="text-lg font-semibold">Moderation</h1>
          {linkSent ? (
            <p className="text-sm text-muted-foreground">
              Check your inbox for a sign-in link, then return to this page.
            </p>
          ) : (
            <>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@houseofguilty.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? "Sending…" : "Send magic link"}
              </Button>
            </>
          )}
        </form>
      </main>
    );
  }

  // Logged in, but not an admin: RPC rejected.
  if (notAuthorized) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-sm text-muted-foreground">Not authorized.</p>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </main>
    );
  }

  // Logged in admin: the queue.
  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">
            Pending{rows.length ? ` · ${rows.length}` : ""}
          </h1>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </header>

        {loadingRows ? (
          <p className="text-sm text-muted-foreground">Loading queue…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing pending.</p>
        ) : (
          <ul className="space-y-4">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>#{row.subject_number}</span>
                  <span>{row.source}</span>
                  <span>{new Date(row.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{row.confession_text}</p>
                {row.verdict_text ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground border-l-2 border-border pl-3">
                    {row.verdict_text}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === row.id}
                    onClick={() => setStatus(row, "approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId === row.id}
                    onClick={() => setStatus(row, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
};

export default Moderate;
