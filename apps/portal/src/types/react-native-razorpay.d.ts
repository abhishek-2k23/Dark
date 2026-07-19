/**
 * `react-native-razorpay` ships no TypeScript types (no `types` field, no
 * bundled .d.ts), so this declares the slice of its surface we actually use.
 *
 * Narrower than the real API on purpose: `open()` accepts many more options
 * than these, but declaring only what we pass means a typo in an option name
 * is a compile error rather than a silently ignored field at the native
 * boundary.
 */
declare module "react-native-razorpay" {
  export interface RazorpayOptions {
    /** Publishable key id. Comes from the server per checkout — never bundled. */
    key: string;
    /** Order id created server-side; binds the payment to a known amount. */
    order_id: string;
    /** Integer paise. Razorpay rejects non-integers. */
    amount: number;
    currency: string;
    name: string;
    description?: string;
    image?: string;
    prefill?: {
      email?: string;
      contact?: string;
      name?: string;
    };
    notes?: Record<string, string>;
    theme?: { color?: string };
  }

  /** What the SDK hands back on success. The signature is verified server-side. */
  export interface RazorpaySuccess {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  /**
   * Failure shape. `code` distinguishes a user cancelling from a real failure;
   * `description` is Razorpay's own message and is safe to surface.
   */
  export interface RazorpayError {
    code: number | string;
    description: string;
    error?: { code?: string; description?: string; reason?: string };
  }

  export default class RazorpayCheckout {
    static open(options: RazorpayOptions): Promise<RazorpaySuccess>;
    static onExternalWalletSelection(cb: (data: unknown) => void): void;
  }
}
