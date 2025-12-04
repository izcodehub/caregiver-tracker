'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Users, LogOut, Loader2, ChevronRight } from 'lucide-react';

type Beneficiary = {
  id: string;
  name: string;
  address: string;
  qr_code: string;
  regular_rate: number;
  holiday_rate: number;
  currency: string;
};

export default function AdminPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeToday, setActiveToday] = useState(0);
  const [totalCaregivers, setTotalCaregivers] = useState(0);

  useEffect(() => {
    // Check if user is admin
    if (!user) {
      router.push('/login');
      return;
    }

    if (user.role !== 'admin') {
      router.push(`/dashboard/${user.beneficiary_id}`);
      return;
    }

    loadClients();
  }, [user]);

  const loadClients = async () => {
    try {
      const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .order('name');

      if (error) throw error;
      setClients(data || []);

      // Load stats
      await loadStats();
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // Get active check-ins today
      const today = new Date().toISOString().split('T')[0];

      // Count beneficiaries with active check-ins today
      const { data: checkIns, error: checkInsError } = await supabase
        .from('check_in_outs')
        .select('beneficiary_id, action, timestamp')
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`)
        .order('timestamp', { ascending: true });

      if (checkInsError) throw checkInsError;

      // Count unique beneficiaries with check-ins today
      const beneficiariesWithActivity = new Set<string>();
      if (checkIns) {
        checkIns.forEach(ci => beneficiariesWithActivity.add(ci.beneficiary_id));
      }
      setActiveToday(beneficiariesWithActivity.size);

      // Get total unique caregivers
      const { data: caregivers, error: caregiversError } = await supabase
        .from('check_in_outs')
        .select('caregiver_name');

      if (caregiversError) throw caregiversError;

      const uniqueCaregivers = new Set<string>();
      if (caregivers) {
        caregivers.forEach(c => {
          if (c.caregiver_name) uniqueCaregivers.add(c.caregiver_name);
        });
      }
      setTotalCaregivers(uniqueCaregivers.size);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const viewClientDashboard = (clientId: string) => {
    router.push(`/dashboard/${clientId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-4 md:py-6">
            {/* Top row: Title and logout */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Caregiver Tracker</h1>
                <p className="text-xs md:text-sm text-gray-600 mt-1">
                  <span className="hidden sm:inline">Admin Panel - Manage all clients and caregivers</span>
                  <span className="sm:hidden">Admin Panel</span>
                </p>
              </div>
              <div className="flex items-center gap-2 md:gap-4">
                <span className="text-xs md:text-sm text-gray-600">
                  <span className="hidden sm:inline">Welcome, </span>
                  <span className="font-semibold">{user?.name}</span>
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                >
                  <LogOut size={16} className="md:w-5 md:h-5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="text-blue-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Clients</p>
                <p className="text-2xl font-bold text-gray-900">{clients.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Users className="text-green-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600">Clients with Activity Today</p>
                <p className="text-2xl font-bold text-gray-900">{activeToday}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Users className="text-purple-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Caregivers</p>
                <p className="text-2xl font-bold text-gray-900">{totalCaregivers}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Clients List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">All Clients</h2>
          </div>

          {clients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600">No clients found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => viewClientDashboard(client.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {client.name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">{client.address}</p>
                      <div className="flex gap-4 mt-2 text-sm text-gray-500">
                        <span>Regular: {client.currency}{client.regular_rate}/h</span>
                        <span>Holiday: {client.currency}{client.holiday_rate}/h</span>
                      </div>
                    </div>
                    <ChevronRight className="text-gray-400" size={24} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
