"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Ban } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "~/components/ui/input-otp";
import { requestAccountDeletion, confirmAccountDeletion } from "~/lib/api";

type Stage = "email" | "otp" | "done";

const OTP_LENGTH = 6;

export function DeleteAccountFlow() {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);

  async function onRequest(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setBlocked(false);
    try {
      const res = await requestAccountDeletion(email.trim());
      if (res.status === "DEMO_BLOCKED") {
        setBlocked(true);
        return;
      }
      if (res.devCode) setCode(res.devCode);
      setStage("otp");
      toast.success("We've sent a verification code to your email.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (loading || code.length < OTP_LENGTH) return;
    setLoading(true);
    try {
      await confirmAccountDeletion(email.trim(), code);
      setStage("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await requestAccountDeletion(email.trim());
      if (res.status === "DEMO_BLOCKED") {
        setStage("email");
        setBlocked(true);
        return;
      }
      if (res.devCode) setCode(res.devCode);
      toast.success("A new code is on its way.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (stage === "done") {
    return (
      <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-3 size-10 text-primary" />
        <h2 className="text-lg font-semibold">Account deleted</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account and personal data have been permanently removed. You can register again with
          the same email or phone number in the future.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      {blocked && (
        <div className="mb-5 flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <Ban className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-500" />
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Demo accounts can&apos;t be deleted
            </p>
            <p className="mt-1 text-muted-foreground">
              This is a demo/test account used to explore the app, so it can&apos;t be removed. If
              this is your real account, double-check the email address.
            </p>
          </div>
        </div>
      )}

      {stage === "email" ? (
        <form onSubmit={onRequest} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Account email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll email a 6-digit code to confirm it&apos;s really you.
            </p>
          </div>
          <Button type="submit" variant="destructive" className="w-full" disabled={loading || !email}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Send verification code
          </Button>
        </form>
      ) : (
        <form onSubmit={onConfirm} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="otp">Verification code</Label>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code sent to <span className="font-medium text-foreground">{email}</span>.
            </p>
            <InputOTP
              id="otp"
              maxLength={OTP_LENGTH}
              value={code}
              onChange={setCode}
              disabled={loading}
              containerClassName="pt-1"
            >
              <InputOTPGroup>
                {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-muted-foreground">
              This permanently deletes your account and personal data. This can&apos;t be undone.
            </p>
          </div>

          <Button
            type="submit"
            variant="destructive"
            className="w-full"
            disabled={loading || code.length < OTP_LENGTH}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Permanently delete my account
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setStage("email");
                setCode("");
              }}
              disabled={loading}
            >
              Change email
            </button>
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:underline"
              onClick={onResend}
              disabled={loading}
            >
              Resend code
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
