import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendCheckInNotification, sendCheckOutNotification } from '@/lib/push-notification-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      beneficiary_qr_code,
      secret,
      challenge_token,
      tap_timestamp,
      verification_method,
      caregiver_name,
      action,
      is_training,
      photo_url,
      latitude,
      longitude,
    } = body;

    // Validate required fields
    if (!beneficiary_qr_code || !tap_timestamp) {
      return NextResponse.json(
        { error: 'Please tap the beneficiary\'s card/QR code to start the visit.' },
        { status: 400 }
      );
    }

    if (!caregiver_name || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // QR code method (no secret) requires geolocation
    if (verification_method === 'qr' && (!latitude || !longitude)) {
      return NextResponse.json(
        { error: 'Geolocation is required when using QR code. Please enable location services.' },
        { status: 400 }
      );
    }

    // NFC method (has secret) requires secret and challenge token
    if (verification_method === 'nfc' && (!secret || !challenge_token)) {
      return NextResponse.json(
        { error: 'Invalid NFC credentials.' },
        { status: 400 }
      );
    }

    // Find beneficiary
    const { data: beneficiary, error: beneficiaryError } = await supabase
      .from('beneficiaries')
      .select('id, name, nfc_secret')
      .eq('qr_code', beneficiary_qr_code)
      .single();

    if (beneficiaryError || !beneficiary) {
      return NextResponse.json(
        { error: 'Invalid beneficiary code' },
        { status: 404 }
      );
    }

    // Only validate secret for NFC method
    if (verification_method === 'nfc') {
      // Validate secret matches
      if (beneficiary.nfc_secret !== secret) {
        return NextResponse.json(
          { error: 'Invalid NFC credentials. Please tap the card again.' },
          { status: 403 }
        );
      }

      // Check if challenge token was already used
      const { data: usedToken } = await supabase
        .from('nfc_used_tokens')
        .select('id')
        .eq('challenge_token', challenge_token)
        .single();

      if (usedToken) {
        return NextResponse.json(
          { error: 'This NFC tap has already been used. Please tap the card again.' },
          { status: 400 }
        );
      }

      // Validate tap timestamp is recent (within 15 minutes)
      const tapTime = new Date(tap_timestamp).getTime();
      const now = Date.now();
      const minutesElapsed = (now - tapTime) / 1000 / 60;

      if (minutesElapsed > 15) {
        return NextResponse.json(
          { error: 'NFC tap expired. Please tap the card again.' },
          { status: 400 }
        );
      }

      if (minutesElapsed < 0) {
        return NextResponse.json(
          { error: 'Invalid tap timestamp' },
          { status: 400 }
        );
      }

      // Mark token as used (prevents replay attacks)
      await supabase
        .from('nfc_used_tokens')
        .insert({
          challenge_token,
          beneficiary_id: beneficiary.id,
        });
    }
    // For QR code method, no secret validation needed - geolocation is the security measure

    // Look up caregiver ID from name
    let caregiverId = null;
    const { data: caregiverData } = await supabase
      .from('caregivers')
      .select('id')
      .eq('beneficiary_id', beneficiary.id)
      .ilike('name', caregiver_name.trim())
      .single();

    if (caregiverData) {
      caregiverId = caregiverData.id;
    }

    // Create the check-in/out record
    const { data: checkIn, error: checkInError } = await supabase
      .from('check_in_outs')
      .insert({
        beneficiary_id: beneficiary.id,
        caregiver_id: caregiverId,
        caregiver_name: caregiver_name.trim(),
        action,
        is_training: is_training || false,
        photo_url,
        latitude,
        longitude,
        verification_method: verification_method || 'nfc',
        nfc_challenge_token: challenge_token,
        tap_timestamp: tap_timestamp,
        is_verified: true,
        verification_flags: {
          method: verification_method || 'nfc',
          secret_validated: verification_method === 'nfc', // Only NFC has secret validation
          has_geolocation: latitude && longitude ? true : false,
          geolocation_required: verification_method === 'qr',
          has_photo: photo_url ? true : false,
        },
      })
      .select()
      .single();

    if (checkInError) {
      console.error('Check-in error:', checkInError);
      return NextResponse.json(
        { error: 'Failed to record check-in' },
        { status: 500 }
      );
    }

    // Send push notifications to family members with notifications enabled
    try {
      const { data: familyMembers } = await supabase
        .from('family_members')
        .select('id, notification_preferences')
        .eq('beneficiary_id', beneficiary.id);

      if (familyMembers && familyMembers.length > 0) {
        // Filter family members who have notifications enabled
        const notificationEnabledMembers = familyMembers.filter(
          (member) => member.notification_preferences?.push_enabled === true
        );

        if (notificationEnabledMembers.length > 0) {
          const familyMemberIds = notificationEnabledMembers.map((m) => m.id);

          if (action === 'check-in') {
            await sendCheckInNotification(
              caregiver_name.trim(),
              familyMemberIds,
              new Date(tap_timestamp),
              beneficiary.name
            );
          } else if (action === 'check-out') {
            await sendCheckOutNotification(
              caregiver_name.trim(),
              familyMemberIds,
              new Date(tap_timestamp),
              beneficiary.name
            );
          }
        }
      }
    } catch (notificationError) {
      // Log error but don't fail the check-in/out
      console.error('Failed to send notifications:', notificationError);
    }

    return NextResponse.json({
      success: true,
      checkIn,
      message: `Successfully ${action === 'check-in' ? 'checked in' : 'checked out'}`,
    });
  } catch (error: any) {
    console.error('NFC check-in error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
