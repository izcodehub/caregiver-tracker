'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type User = {
  id: string;
  email: string;
  role: 'admin' | 'family';
  name: string;
  beneficiary_id?: string;
};

type AuthContextType = {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Skip auth loading on public pages (check-in doesn't need auth)
    const publicPages = ['/checkin', '/login', '/'];
    const isPublicPage = publicPages.some(page => pathname?.startsWith(page));

    if (isPublicPage && pathname !== '/') {
      console.log('[AuthContext] Public page detected, skipping auth');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let hasLoaded = false;

    // Check for Supabase session (magic link users)
    const checkSupabaseSession = async () => {
      console.log('[AuthContext] Starting session check...');

      // FIRST: Check localStorage for saved user data (fast, works offline)
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          console.log('[AuthContext] Found stored user data:', userData.email);
          setUser(userData);
          setIsLoading(false);
          hasLoaded = true;
          console.log('[AuthContext] Loaded from localStorage (offline-safe)');

          // Continue to verify session in background (don't await)
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
              // Session expired but localStorage still has data - clear it
              console.log('[AuthContext] Session expired, clearing localStorage');
              localStorage.removeItem('user');
              if (isMounted) {
                setUser(null);
              }
            }
          }).catch(err => {
            console.log('[AuthContext] Background session check failed (offline?):', err.message);
            // Keep user logged in from localStorage even if network fails
          });

          return;
        } catch (err) {
          console.error('[AuthContext] Error parsing stored user:', err);
          localStorage.removeItem('user');
        }
      }

      // SECOND: No localStorage data - check Supabase session
      console.log('[AuthContext] No localStorage data, checking Supabase session');

      // Ensure we always set loading to false eventually
      const timeoutId = setTimeout(() => {
        console.log('[AuthContext] Session check timeout - forcing loading to false');
        if (isMounted && !hasLoaded) {
          setIsLoading(false);
          hasLoaded = true;
        }
      }, 5000); // 5 second max wait (increased for Android)

      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[AuthContext] Session:', session ? 'exists' : 'none');

        if (!isMounted) {
          clearTimeout(timeoutId);
          return;
        }

        if (session?.user) {
          // User logged in via magic link
          const email = session.user.email!;
          console.log('[AuthContext] Magic link user:', email);

          // Try to find family member
          const { data: familyMember } = await supabase
            .from('family_members')
            .select('id, name, beneficiary_id')
            .eq('email', email)
            .single();

          if (!isMounted) {
            clearTimeout(timeoutId);
            return;
          }

          if (familyMember) {
            console.log('[AuthContext] Found family member:', familyMember.name);
            const userData = {
              id: familyMember.id,
              email,
              role: 'family' as const,
              name: familyMember.name,
              beneficiary_id: familyMember.beneficiary_id
            };
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
            clearTimeout(timeoutId);
            setIsLoading(false);
            hasLoaded = true;
            return;
          }

          // Try to find primary contact
          const { data: primaryUser } = await supabase
            .from('users')
            .select('id, email, role, name, beneficiary_id')
            .eq('email', email)
            .single();

          if (!isMounted) {
            clearTimeout(timeoutId);
            return;
          }

          if (primaryUser) {
            console.log('[AuthContext] Found primary user:', primaryUser.name);
            const userData = {
              id: primaryUser.id,
              email: primaryUser.email,
              role: primaryUser.role as 'admin' | 'family',
              name: primaryUser.name,
              beneficiary_id: primaryUser.beneficiary_id
            };
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
          }
        } else {
          // No Supabase session, check localStorage for password-based login
          console.log('[AuthContext] No Supabase session, checking localStorage');
          const storedUser = localStorage.getItem('user');
          if (storedUser && isMounted) {
            console.log('[AuthContext] Found stored user');
            setUser(JSON.parse(storedUser));
          }
        }

        clearTimeout(timeoutId);
        if (isMounted && !hasLoaded) {
          setIsLoading(false);
          hasLoaded = true;
          console.log('[AuthContext] Loading complete');
        }
      } catch (error) {
        console.error('[AuthContext] Error checking session:', error);
        clearTimeout(timeoutId);
        if (isMounted && !hasLoaded) {
          setIsLoading(false);
          hasLoaded = true;
        }
      }
    };

    checkSupabaseSession();

    // Listen for auth changes - handle all relevant events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] Auth state change:', event, 'Session exists:', !!session, 'Has loaded:', hasLoaded);

      if (!isMounted) return;

      // Handle different auth events
      if (event === 'SIGNED_IN' && session) {
        // Only reload if we haven't loaded yet (prevents loops on Android Chrome)
        if (!hasLoaded) {
          console.log('[AuthContext] Session detected, loading user data');
          hasLoaded = false; // Allow reload
          await checkSupabaseSession();
        } else {
          console.log('[AuthContext] Already loaded, ignoring SIGNED_IN event');
        }
      } else if (event === 'INITIAL_SESSION') {
        if (session) {
          console.log('[AuthContext] Initial session detected, loading user data');
          hasLoaded = false;
          await checkSupabaseSession();
        } else {
          // Initial session but no session found, check localStorage
          console.log('[AuthContext] No session in INITIAL_SESSION, checking localStorage');
          const storedUser = localStorage.getItem('user');
          if (storedUser && isMounted) {
            setUser(JSON.parse(storedUser));
          }
          if (isMounted && !hasLoaded) {
            setIsLoading(false);
            hasLoaded = true;
          }
        }
      } else if (event === 'SIGNED_OUT') {
        // Only clear data on explicit sign out
        console.log('[AuthContext] User signed out');
        setUser(null);
        localStorage.removeItem('user');
      }
      // TOKEN_REFRESHED and USER_UPDATED are ignored to prevent loops
    });

    return () => {
      console.log('[AuthContext] Cleanup');
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [pathname]);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // Call API route to verify credentials
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        return false;
      }

      const userData = await response.json();
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));

      // Redirect based on role
      if (userData.role === 'admin') {
        router.push('/admin');
      } else {
        router.push(`/dashboard/${userData.beneficiary_id}`);
      }

      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = async () => {
    // Sign out from Supabase if logged in via magic link
    await supabase.auth.signOut();

    setUser(null);
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
