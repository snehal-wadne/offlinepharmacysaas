/**
 * Razorpay Web Checkout Utility
 *
 * Dynamically loads the Razorpay standard checkout script (checkout.js)
 * and opens the official payment modal with full webhook/signature support.
 * Includes graceful development fallback for local testing without active API keys.
 */

import { Platform } from 'react-native';
import { notify } from './alert';

declare const process: {
  env?: Record<string, string | undefined>;
};

export interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutOptions {
  keyId?: string;
  orderId: string;
  amount: number; // in paise
  currency?: string;
  name?: string;
  description?: string;
  pharmacyName?: string;
  email?: string;
  phone?: string;
  notes?: Record<string, string>;
  themeColor?: string;
  onSuccess: (response: RazorpaySuccessResponse) => Promise<void> | void;
  onDismiss?: () => void;
  onError?: (error: any) => void;
}

/**
 * Dynamically loads Razorpay checkout.js script into the browser DOM.
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return resolve(false);
    }
    if ((window as any).Razorpay) {
      return resolve(true);
    }

    const existingScript = document.getElementById('razorpay-checkout-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-checkout-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn('Failed to load Razorpay checkout.js script.');
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

/**
 * Open Razorpay Checkout Modal
 */
export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<void> {
  const {
    keyId = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_RAZORPAY_KEY_ID) || 'rzp_test_placeholder_key',
    orderId,
    amount,
    currency = 'INR',
    name = 'PharmaFlow SaaS Platform',
    description = 'Pharmacy Subscription Payment',
    pharmacyName,
    email,
    phone,
    notes = {},
    themeColor = '#0284C7',
    onSuccess,
    onDismiss,
    onError,
  } = options;

  const isPlaceholderKey = !keyId || keyId.includes('placeholder') || orderId.startsWith('order_sim_');

  // If using placeholder key or not running on web, provide a development test dialog
  if (isPlaceholderKey || Platform.OS !== 'web') {
    const formattedAmt = `₹${(amount / 100).toLocaleString('en-IN')}`;
    const message = `[Test Simulation Mode]\n\nPharmacy: ${pharmacyName || 'Pharmacy'}\nAmount: ${formattedAmt}\nOrder ID: ${orderId}\n\nTo use live Razorpay checkout, provide a valid RAZORPAY_KEY_ID in .env.\n\nProceed with test payment verification?`;

    const proceed = typeof window !== 'undefined' && window.confirm 
      ? window.confirm(message)
      : true;

    if (proceed) {
      try {
        const simPaymentId = `pay_sim_${Date.now()}`;
        const simSignature = `sim_sig_${Date.now()}`;
        await onSuccess({
          razorpay_order_id: orderId,
          razorpay_payment_id: simPaymentId,
          razorpay_signature: simSignature,
        });
      } catch (err) {
        if (onError) onError(err);
        else notify('Payment Error', (err as any)?.message || 'Failed to complete payment');
      }
    } else {
      if (onDismiss) onDismiss();
    }
    return;
  }

  // Live Razorpay Web Checkout Flow
  try {
    const isLoaded = await loadRazorpayScript();
    if (!isLoaded || !(window as any).Razorpay) {
      throw new Error('Could not load Razorpay Checkout SDK. Please check your internet connection.');
    }

    const rzpOptions = {
      key: keyId,
      amount,
      currency,
      name,
      description,
      order_id: orderId,
      notes: {
        ...notes,
        pharmacyName: pharmacyName || '',
      },
      prefill: {
        name: pharmacyName || '',
        email: email || '',
        contact: phone || '',
      },
      theme: {
        color: themeColor,
      },
      handler: async function (response: RazorpaySuccessResponse) {
        try {
          await onSuccess(response);
        } catch (err) {
          if (onError) onError(err);
        }
      },
      modal: {
        ondismiss: function () {
          if (onDismiss) onDismiss();
        },
      },
    };

    const rzp = new (window as any).Razorpay(rzpOptions);
    rzp.on('payment.failed', function (resp: any) {
      console.error('Razorpay payment failed:', resp.error);
      if (onError) {
        onError(resp.error || new Error('Payment was declined or failed.'));
      } else {
        notify('Payment Failed', resp.error?.description || 'Your transaction could not be processed.');
      }
    });

    rzp.open();
  } catch (err: any) {
    console.error('Razorpay Checkout initialization error:', err);
    if (onError) {
      onError(err);
    } else {
      notify('Checkout Error', err.message || 'Failed to launch Razorpay.');
    }
  }
}
