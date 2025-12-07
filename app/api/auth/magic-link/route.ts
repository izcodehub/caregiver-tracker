import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if user exists in family_members table
    const { data: familyMember } = await supabaseAdmin
      .from('family_members')
      .select('id, beneficiary_id, auth_user_id')
      .eq('email', email)
      .single();

    if (!familyMember) {
      // Also check if it's a primary contact in users table
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('email, beneficiary_id')
        .eq('email', email)
        .single();

      if (!userData) {
        return NextResponse.json(
          { error: 'No account found with this email' },
          { status: 404 }
        );
      }

      // Send magic link for primary contact
      const { error: magicLinkError } = await supabaseAdmin.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${userData.beneficiary_id}`,
        }
      });

      if (magicLinkError) {
        console.error('Magic link error:', magicLinkError);
        return NextResponse.json(
          { error: 'Failed to send magic link' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Magic link sent to your email'
      });
    }

    // If no auth_user_id, create Supabase auth user first
    if (!familyMember.auth_user_id) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          family_member_id: familyMember.id,
          beneficiary_id: familyMember.beneficiary_id
        }
      });

      if (authError) {
        console.error('Auth user creation error:', authError);
        return NextResponse.json(
          { error: 'Failed to create auth user' },
          { status: 500 }
        );
      }

      // Update family_members with auth_user_id
      await supabaseAdmin
        .from('family_members')
        .update({ auth_user_id: authData.user.id })
        .eq('id', familyMember.id);
    }

    // Send magic link for family member
    const { error: magicLinkError } = await supabaseAdmin.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${familyMember.beneficiary_id}`,
      }
    });

    if (magicLinkError) {
      console.error('Magic link error:', magicLinkError);
      return NextResponse.json(
        { error: 'Failed to send magic link' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Magic link sent to your email'
    });

  } catch (error) {
    console.error('Magic link error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
