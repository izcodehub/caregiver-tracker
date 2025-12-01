import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { beneficiary_id, name, email, phone, role } = await request.json();

    // Validate required fields
    if (!beneficiary_id || !name || !email) {
      return NextResponse.json(
        { error: 'Beneficiary ID, name, and email are required' },
        { status: 400 }
      );
    }

    // Check if email already exists for this beneficiary
    const { data: existing } = await supabase
      .from('family_members')
      .select('id')
      .eq('beneficiary_id', beneficiary_id)
      .eq('email', email)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'A family member with this email already exists' },
        { status: 409 }
      );
    }

    // Create family member record
    const { data, error } = await supabase
      .from('family_members')
      .insert({
        beneficiary_id,
        name,
        email,
        phone: phone || null,
        role: role || 'secondary',
        notification_preferences: {
          email: true,
          sms: phone ? true : false,
          push: true,
          check_in: true,
          check_out: true,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating family member:', error);
      return NextResponse.json(
        { error: 'Failed to add family member' },
        { status: 500 }
      );
    }

    // Get beneficiary and inviter info for email
    const { data: beneficiary } = await supabase
      .from('beneficiaries')
      .select('name')
      .eq('id', beneficiary_id)
      .single();

    // Get inviter (primary family member) info
    const { data: primaryFamily } = await supabase
      .from('family_members')
      .select('name')
      .eq('beneficiary_id', beneficiary_id)
      .eq('role', 'primary')
      .single();

    // Create Supabase Auth user and send magic link
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        name,
        inviter_name: primaryFamily?.name || 'Le membre principal',
        beneficiary_name: beneficiary?.name || 'le bénéficiaire',
        beneficiary_id
      }
    });

    if (authError) {
      console.error('Auth user creation error:', authError);
      // Continue - family member record exists
    } else {
      // Update family_members with auth_user_id
      await supabase
        .from('family_members')
        .update({ auth_user_id: authData.user.id })
        .eq('id', data.id);

      // Send magic link
      const { error: magicLinkError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${beneficiary_id}`,
        }
      });

      if (magicLinkError) {
        console.error('Magic link error:', magicLinkError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Family member added successfully',
      familyMember: data,
    });
  } catch (error) {
    console.error('Add family member error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
