import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { qr_code, secret, method, timestamp } = body;

    if (!qr_code || !secret || !timestamp) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const verificationMethod = method === 'qr' ? 'qr' : 'nfc';

    // Verify timestamp is recent (within 30 seconds)
    const tapTime = new Date(timestamp).getTime();
    const now = Date.now();
    const secondsElapsed = (now - tapTime) / 1000;

    if (secondsElapsed > 30 || secondsElapsed < 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired timestamp' },
        { status: 400 }
      );
    }

    // Find beneficiary by QR code and validate secret
    const { data: beneficiary, error } = await supabase
      .from('beneficiaries')
      .select('id, name, nfc_secret')
      .eq('qr_code', qr_code)
      .single();

    if (error || !beneficiary) {
      return NextResponse.json(
        { success: false, message: 'Invalid QR code' },
        { status: 404 }
      );
    }

    // Validate secret matches (same secret used for both NFC and QR code)
    if (beneficiary.nfc_secret !== secret) {
      return NextResponse.json(
        { success: false, message: 'Invalid secret' },
        { status: 403 }
      );
    }

    // Generate challenge token (random UUID + timestamp)
    const challengeToken = `${randomBytes(16).toString('hex')}-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    return NextResponse.json({
      success: true,
      challengeToken,
      expiresAt: expiresAt.toISOString(),
      beneficiaryId: beneficiary.id,
      beneficiaryName: beneficiary.name,
      method: verificationMethod,
    });
  } catch (error: any) {
    console.error('Challenge error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
