'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      console.log('[AuthCallback] Processing auth callback...');

      try {
        // Check for errors in URL hash
        if (typeof window !== 'undefined' && window.location.hash) {
          const hash = window.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const error = params.get('error');
          const errorDescription = params.get('error_description');

          if (error) {
            console.error('[AuthCallback] Error in URL:', error, errorDescription);
            if (error === 'access_denied' && errorDescription?.includes('expired')) {
              router.push('/login?error=link_expired');
            } else {
              router.push('/login?error=auth_failed');
            }
            return;
          }
        }

        // Get the session from the URL hash
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[AuthCallback] Error getting session:', error);
          router.push('/login?error=auth_failed');
          return;
        }

        if (!session) {
          console.log('[AuthCallback] No session found, redirecting to login');
          router.push('/login?error=no_session');
          return;
        }

        console.log('[AuthCallback] Session found for:', session.user.email);

        // Try to find the user in family_members or users table
        const email = session.user.email!;

        // Check family_members first
        const { data: familyMember } = await supabase
          .from('family_members')
          .select('id, name, beneficiary_id')
          .eq('email', email)
          .single();

        if (familyMember) {
          console.log('[AuthCallback] Found family member, redirecting to dashboard');
          const userData = {
            id: familyMember.id,
            email,
            role: 'family' as const,
            name: familyMember.name,
            beneficiary_id: familyMember.beneficiary_id
          };
          localStorage.setItem('user', JSON.stringify(userData));
          router.push(`/dashboard/${familyMember.beneficiary_id}`);
          return;
        }

        // Check primary users
        const { data: primaryUser } = await supabase
          .from('users')
          .select('id, email, role, name, beneficiary_id')
          .eq('email', email)
          .single();

        if (primaryUser) {
          console.log('[AuthCallback] Found primary user, redirecting to dashboard');
          const userData = {
            id: primaryUser.id,
            email: primaryUser.email,
            role: primaryUser.role as 'admin' | 'family',
            name: primaryUser.name,
            beneficiary_id: primaryUser.beneficiary_id
          };
          localStorage.setItem('user', JSON.stringify(userData));

          if (primaryUser.role === 'admin') {
            router.push('/admin');
          } else {
            router.push(`/dashboard/${primaryUser.beneficiary_id}`);
          }
          return;
        }

        // No user found
        console.log('[AuthCallback] No user found for email:', email);
        router.push('/login?error=user_not_found');

      } catch (error) {
        console.error('[AuthCallback] Unexpected error:', error);
        router.push('/login?error=unexpected');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <Loader2 className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
        <p className="text-gray-700">Authenticating...</p>
        <p className="text-sm text-gray-500 mt-2">Please wait while we log you in</p>
      </div>
    </div>
  );
}
