'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    redirectToFirstElderly();
  }, []);

  const redirectToFirstElderly = async () => {
    try {
      // Get the first elderly person
      const { data } = await supabase
        .from('elderly')
        .select('id')
        .limit(1)
        .single();

      if (data) {
        // Redirect to their dashboard
        router.push(`/dashboard/${data.id}`);
      } else {
        // No elderly persons found
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading elderly:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">No Clients Found</h1>
        <p className="text-gray-600">
          Please add an elderly profile in Supabase to get started.
        </p>
      </div>
    </div>
  );
}
