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

    // Get beneficiary name for email
    const { data: beneficiary } = await supabase
      .from('beneficiaries')
      .select('name')
      .eq('id', beneficiary_id)
      .single();

    // Send magic link email via Supabase Auth
    const { error: magicLinkError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${beneficiary_id}`,
        data: {
          name,
          beneficiary_id,
          beneficiary_name: beneficiary?.name
        }
      }
    });

    if (magicLinkError) {
      console.error('Magic link error:', magicLinkError);
      // Don't fail - family member was added successfully
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
