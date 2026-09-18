'use client';
/**
 * The Google button on the sign-in card.
 *
 * ── Why Google Identity Services and not a redirect flow ───────────────────
 * The classic authorization-code flow needs a client *secret*, a redirect URI,
 * and server-side state to defend the round trip. All of that buys the ability
 * to call Google APIs as the user, which this app never does, it only needs
 * to know who is at the keyboard. GIS answers exactly that question: the
 * browser gets a signed ID token and posts it to our own origin, where
 * `verifyGoogleIdToken` checks Google's signature. No secret, no redirect, no
 * callback route, and nothing to get wrong about `state`.
 *
 * ── The script is loaded here, not in the layout ───────────────────────────
 * /admin is the only page that needs it, and it is `force-dynamic`. Putting a
 * third-party script in the root layout would add a blocking request to `/`,
 * which is statically rendered and has no business talking to Google, the
 * same reasoning that keeps `useSearchParams()` out of the homepage.
 *
 * ── It will not work without a CSP entry ───────────────────────────────────
 * `next.config.ts` ships `default-src 'self'` in production only, so a missing
 * `accounts.google.com` in `script-src`/`connect-src`/`frame-src` fails in
 * production while working perfectly in dev. See the note there.
 */
import { useEffect, useRef, useState } from 'react';
import { signInWithGoogle } from '@/lib/admin-client';

const SRC = 'https://accounts.google.com/gsi/client';

interface CredentialResponse {
  credential?: string;
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select: boolean;
    cancel_on_tap_outside: boolean;
    ux_mode: 'popup';
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline' | 'filled_black';
      size: 'large';
      text: 'signin_with';
      shape: 'rectangular';
      width: number;
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

/** Loaded once per document, and shared by every caller that asks after. */
let loader: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('load')));
      if (window.google?.accounts?.id) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve());
    // Rejected rather than left pending, so a blocked script shows the fallback
    // copy instead of a button-shaped hole that never fills in.
    script.addEventListener('error', () => reject(new Error('load')));
    document.head.appendChild(script);
  });
  return loader;
}

export function GoogleSignIn({ clientId }: { clientId: string }) {
  const slot = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'blocked' | 'denied' | 'rejected'
  >('loading');

  useEffect(() => {
    let live = true;

    loadScript()
      .then(() => {
        const api = window.google?.accounts?.id;
        if (!live || !api || !slot.current) return;
        api.initialize({
          client_id: clientId,
          // One tap is deliberately off: this is a deliberate sign-in to an
          // admin panel, not a convenience prompt on a content page.
          auto_select: false,
          cancel_on_tap_outside: true,
          ux_mode: 'popup',
          callback: (response) => {
            const credential = response.credential;
            if (!credential) return;
            void signInWithGoogle(credential).then((outcome) => {
              if (outcome === 'ok') location.reload();
              else if (live) setState(outcome === 'not-allowed' ? 'denied' : 'rejected');
            });
          },
        });
        api.renderButton(slot.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 320,
        });
        setState('ready');
      })
      .catch(() => {
        if (live) setState('blocked');
      });

    return () => {
      live = false;
    };
  }, [clientId]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={slot} className="flex min-h-[40px] justify-center" />
      {state === 'loading' ? (
        <p className="text-center text-xs text-muted-foreground">Loading Google sign-in…</p>
      ) : null}
      {state === 'blocked' ? (
        <p className="text-center text-xs text-muted-foreground">
          Google sign-in could not load. Use the access token below.
        </p>
      ) : null}
      {state === 'denied' ? (
        <p className="text-center text-xs text-destructive">
          That account is not on the allowlist.
        </p>
      ) : null}
      {state === 'rejected' ? (
        <p className="text-center text-xs text-destructive">
          Google sign-in could not be verified. Check the server log for the
          reason, or use the access token below.
        </p>
      ) : null}
    </div>
  );
}
