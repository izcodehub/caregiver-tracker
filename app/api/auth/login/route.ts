import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if user also exists in family_members table (for notification matching)
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('id')
      .eq('email', email)
      .eq('beneficiary_id', user.beneficiary_id)
      .single();

    // Return user data (without password hash)
    const userData = {
      id: familyMember?.id || user.id, // Use family_member_id if exists, otherwise user_id
      user_id: user.id, // Keep original user ID for reference
      email: user.email,
      role: user.role,
      name: user.name,
      beneficiary_id: user.beneficiary_id,
    };

    return NextResponse.json(userData);
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
