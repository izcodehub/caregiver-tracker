/**
 * API Route: Send Push Notifications
 * POST /api/notifications/send
 */
import { NextRequest, NextResponse } from 'next/server';
import { sendCheckInNotification, sendCheckOutNotification } from '@/lib/push-notification-service';

export async function POST(request: NextRequest) {
  try {
    console.log('[Notification API] Received request');
    const body = await request.json();
    console.log('[Notification API] Request body:', body);

    const { familyMemberIds, caregiverName, beneficiaryName, action, timestamp } = body;

    if (!familyMemberIds || !Array.isArray(familyMemberIds) || familyMemberIds.length === 0) {
      console.log('[Notification API] No family member IDs provided');
      return NextResponse.json(
        { error: 'No family member IDs provided' },
        { status: 400 }
      );
    }

    if (!caregiverName || !action) {
      console.log('[Notification API] Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`[Notification API] Sending ${action} notification for ${caregiverName}`);

    // Send the appropriate notification based on action
    if (action === 'check-in') {
      console.log('[Notification API] Calling sendCheckInNotification');
      await sendCheckInNotification(
        caregiverName,
        familyMemberIds,
        new Date(timestamp || Date.now()),
        beneficiaryName
      );
      console.log('[Notification API] Check-in notification sent');
    } else if (action === 'check-out') {
      console.log('[Notification API] Calling sendCheckOutNotification');
      await sendCheckOutNotification(
        caregiverName,
        familyMemberIds,
        new Date(timestamp || Date.now()),
        beneficiaryName
      );
      console.log('[Notification API] Check-out notification sent');
    } else {
      console.log('[Notification API] Invalid action:', action);
      return NextResponse.json(
        { error: 'Invalid action. Must be "check-in" or "check-out"' },
        { status: 400 }
      );
    }

    console.log(`[Notification API] Success - sent to ${familyMemberIds.length} members`);
    return NextResponse.json({
      success: true,
      message: `Notifications sent to ${familyMemberIds.length} family member(s)`
    });

  } catch (error) {
    console.error('[Notification API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send notifications' },
      { status: 500 }
    );
  }
}
