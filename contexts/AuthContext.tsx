'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

  useEffect(() => {
    let isMounted = true;

    // Check for Supabase session (magic link users)
    const checkSupabaseSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (session?.user) {
          // User logged in via magic link
          const email = session.user.email!;

          // Try to find family member
          const { data: familyMember } = await supabase
            .from('family_members')
            .select('id, name, beneficiary_id')
            .eq('email', email)
            .single();

          if (!isMounted) return;

          if (familyMember) {
            const userData = {
              id: familyMember.id,
              email,
              role: 'family' as const,
              name: familyMember.name,
              beneficiary_id: familyMember.beneficiary_id
            };
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
            setIsLoading(false);
            return;
          }

          // Try to find primary contact
          const { data: primaryUser } = await supabase
            .from('users')
            .select('id, email, role, name, beneficiary_id')
            .eq('email', email)
            .single();

          if (!isMounted) return;

          if (primaryUser) {
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
          const storedUser = localStorage.getItem('user');
          if (storedUser && isMounted) {
            setUser(JSON.parse(storedUser));
          }
        }

        if (isMounted) {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error checking session:', error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    checkSupabaseSession();

    // Listen for auth changes - but only handle specific events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      // Only handle these specific events to avoid loops
      if (event === 'SIGNED_IN') {
        // User just signed in, reload their data
        await checkSupabaseSession();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('user');
      }
      // Ignore other events like TOKEN_REFRESHED, USER_UPDATED to prevent loops
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
