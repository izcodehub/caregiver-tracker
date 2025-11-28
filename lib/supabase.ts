import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database Types
export type CheckInOut = {
  id: string;
  beneficiary_id: string;
  caregiver_name: string;
  action: 'check-in' | 'check-out';
  timestamp: string;
  photo_url?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
};

export type Elderly = {
  id: string;
  name: string;
  qr_code: string;
  address: string;
  latitude?: number;
  longitude?: number;
  family_ids: string[];
  regular_rate: number;
  holiday_rate: number;
  currency: string;
  access_code: string;
  created_at: string;
};

export type FamilyMember = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  notification_preferences: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  created_at: string;
};
