/**
 * API Route: Send Push Notifications
 * POST /api/notifications/send
 */
import { NextRequest, NextResponse } from 'next/server';
import { sendCheckInNotification, sendCheckOutNotification } from '@/lib/push-notification-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { familyMemberIds, caregiverName, beneficiaryName, action, timestamp } = body;

    if (!familyMemberIds || !Array.isArray(familyMemberIds) || familyMemberIds.length === 0) {
      return NextResponse.json(
        { error: 'No family member IDs provided' },
        { status: 400 }
      );
    }

    if (!caregiverName || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Send the appropriate notification based on action
    if (action === 'check-in') {
      await sendCheckInNotification(
        caregiverName,
        familyMemberIds,
        new Date(timestamp || Date.now()),
        beneficiaryName
      );
    } else if (action === 'check-out') {
      await sendCheckOutNotification(
        caregiverName,
        familyMemberIds,
        new Date(timestamp || Date.now()),
        beneficiaryName
      );
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be "check-in" or "check-out"' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Notifications sent to ${familyMemberIds.length} family member(s)`
    });

  } catch (error) {
    console.error('Error sending notifications:', error);
    return NextResponse.json(
      { error: 'Failed to send notifications' },
      { status: 500 }
    );
  }
}
