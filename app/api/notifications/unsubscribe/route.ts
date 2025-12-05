/**
 * API Route: Unsubscribe from Push Notifications
 * POST /api/notifications/unsubscribe
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create admin client with service role key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, familyMemberId } = body;

    if (!endpoint || !familyMemberId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify the family member exists
    const { data: familyMember, error: familyError } = await supabase
      .from('family_members')
      .select('id')
      .eq('id', familyMemberId)
      .single();

    if (familyError || !familyMember) {
      return NextResponse.json(
        { error: 'Family member not found' },
        { status: 404 }
      );
    }

    // Delete the subscription
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('family_member_id', familyMemberId)
      .eq('endpoint', endpoint);

    if (deleteError) {
      console.error('Error deleting subscription:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete subscription' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription removed'
    });

  } catch (error) {
    console.error('Error in unsubscribe route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
