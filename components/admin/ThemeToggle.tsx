'use client';
/**
 * The panel's theme, on the panel's own wrapper element.
 *
 * ── Why it must never write to <html> ──────────────────────────────────────
 * Portfolio.tsx does `document.documentElement.classList.toggle('dark',
 * immersive)` with a cleanup that removes the class. Any admin theme that also
 * wrote to <html> would be clobbered by a mode transition on the public page,
 * or by Portfolio unmounting on a client-side navigation to /admin.
 *
 * Putting `.dark` on a <div> works for both halves of the token system:
 * globals.css defines the full palette on `:root` AND on `.dark` (so the
 * custom properties cascade to the subtree), and `@custom-variant dark
 * (&:is(.dark *))` matches every descendant.
 *
 * One caveat: the `.dark` element itself is NOT matched by `.dark *`, so
 * `dark:` utilities on the wrapper div do nothing. Put them on children, 
 * which is what a layout does anyway.
 *
 * Dark is the default. It is what an analytics panel should be, and it matches
 * the source system.
 */
import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useMediaQuery, useStored } from '@/hooks/use-stored';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'admin:theme';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: 'dark', setTheme: () => {} });

export function useAdminTheme() {
  return useContext(ThemeContext);
}

export function AdminTheme({ children }: { children: ReactNode }) {
  // 'dark' on the server and on the first paint, then the stored choice. A
  // one-frame flash behind an auth gate is not worth an inline <script> in the
  // root layout that would also run on every public page load.
  const [raw, setRaw] = useStored(KEY, 'dark');
  const theme: Theme =
    raw === 'light' || raw === 'system' ? raw : 'dark';
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)', true);

  const setTheme = useCallback((next: Theme) => setRaw(next), [setRaw]);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  return (
    <ThemeContext.Provider value={value}>
      <div
        className={cn(
          'min-h-screen bg-background text-foreground',
          dark && 'dark',
        )}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useAdminTheme();
  return (
    <ToggleGroup
      value={[theme]}
      onValueChange={(next: string[]) => {
        const picked = next[0];
        if (picked) setTheme(picked as Theme);
      }}
      variant="outline"
      size="sm"
      aria-label="Panel theme"
    >
      <ToggleGroupItem value="system" aria-label="Match system">
        <Monitor className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="light" aria-label="Light">
        <Sun className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark">
        <Moon className="size-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
