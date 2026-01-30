import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Custom storage implementation for better PWA persistence
const customStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('[Storage] Error getting item:', error);
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, value);
      console.log('[Storage] Saved session to localStorage');
    } catch (error) {
      console.error('[Storage] Error setting item:', error);
    }
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
      console.log('[Storage] Removed session from localStorage');
    } catch (error) {
      console.error('[Storage] Error removing item:', error);
    }
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Important for magic links
    flowType: 'pkce', // More secure auth flow
    storage: customStorage,
    storageKey: 'caregiver-tracker-auth',
  }
});

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

export type BeneficiaryRateHistory = {
  id: string;
  beneficiary_id: string;
  rate: number;
  effective_date: string; // ISO date string (YYYY-MM-DD)
  created_at: string;
};
