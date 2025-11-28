import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const {
      email,
      password,
      name,
      beneficiaryName,
      address,
      street,
      zip,
      city,
      country,
      currency,
      regularRate,
      holidayRate,
      ticketModerateur,
      familyMembers,
    } = await request.json();

    // Validate required fields
    if (!email || !password || !name || !beneficiaryName || !address) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Generate QR code (unique identifier for the beneficiary)
    const qrCode = `CG-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create beneficiary record first
    const { data: beneficiaryData, error: beneficiaryError } = await supabase
      .from('beneficiaries')
      .insert({
        name: beneficiaryName,
        address,
        qr_code: qrCode,
        country: country || 'FR',
        currency: currency || '€',
        regular_rate: regularRate || 15.00,
        holiday_rate: holidayRate || 22.50,
        ticket_moderateur: ticketModerateur || 0,
      })
      .select()
      .single();

    if (beneficiaryError || !beneficiaryData) {
      console.error('Error creating beneficiary record:', beneficiaryError);
      return NextResponse.json(
        { error: 'Failed to create beneficiary record' },
        { status: 500 }
      );
    }

    // Create user record
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        name,
        role: 'family',
        beneficiary_id: beneficiaryData.id,
      })
      .select()
      .single();

    if (userError || !userData) {
      console.error('Error creating user:', userError);
      // Rollback - delete the beneficiary record
      await supabase
        .from('beneficiaries')
        .delete()
        .eq('id', beneficiaryData.id);

      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      );
    }

    // Create family member records
    if (familyMembers && familyMembers.length > 0) {
      const familyMemberRecords = familyMembers.map((member: any) => ({
        beneficiary_id: beneficiaryData.id,
        name: member.name,
        email: member.email,
        phone: member.phone || null,
        role: member.role || 'secondary',
        notification_preferences: {
          email: true,
          sms: member.phone ? true : false,
          push: true,
          check_in: true,
          check_out: true,
        },
      }));

      const { error: familyMemberError } = await supabase
        .from('family_members')
        .insert(familyMemberRecords);

      if (familyMemberError) {
        console.error('Error creating family members:', familyMemberError);
        // Note: We don't rollback here as the core account is created
        // The family members can be added manually later if needed
      }
    } else {
      // Fallback: Create a single family member record with the user who signed up
      const { error: familyMemberError } = await supabase
        .from('family_members')
        .insert({
          beneficiary_id: beneficiaryData.id,
          name,
          email,
          role: 'primary',
          notification_preferences: {
            email: true,
            sms: false,
            push: true,
            check_in: true,
            check_out: true,
          },
        });

      if (familyMemberError) {
        console.error('Error creating family member:', familyMemberError);
      }
    }

    // Return success
    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        beneficiary_id: userData.beneficiary_id,
      },
      beneficiary: {
        id: beneficiaryData.id,
        name: beneficiaryData.name,
        qr_code: qrCode,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
