import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
    if (!beneficiary_qr_code || !secret || !challenge_token || !tap_timestamp) {
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

    // QR code method requires geolocation
    if (verification_method === 'qr' && (!latitude || !longitude)) {
      return NextResponse.json(
        { error: 'Geolocation is required when using QR code. Please enable location services.' },
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

    // Validate secret matches
    if (beneficiary.nfc_secret !== secret) {
      return NextResponse.json(
        { error: 'Invalid credentials. Please tap the card/QR again.' },
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

    // Create the check-in/out record
    const { data: checkIn, error: checkInError } = await supabase
      .from('check_in_outs')
      .insert({
        beneficiary_id: beneficiary.id,
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
          secret_validated: true,
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
