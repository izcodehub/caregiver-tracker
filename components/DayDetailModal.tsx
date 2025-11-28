'use client';

import { format } from 'date-fns';
import { X, Clock, User, Camera, MapPin, CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import DayNotesSection from './DayNotesSection';

type CheckInOut = {
  id: string;
  beneficiary_id: string;
  caregiver_name: string;
  action: 'check-in' | 'check-out';
  timestamp: string;
  photo_url?: string;
  latitude?: number;
  longitude?: number;
};

type DayDetailModalProps = {
  date: Date;
  checkIns: CheckInOut[];
  onClose: () => void;
};

export default function DayDetailModal({ date, checkIns, onClose }: DayDetailModalProps) {
  const [showPhoto, setShowPhoto] = useState<string | null>(null);

  const calculateDailyHours = () => {
    let totalHours = 0;
    const sorted = [...checkIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].action === 'check-in' && sorted[i + 1].action === 'check-out') {
        const start = new Date(sorted[i].timestamp).getTime();
        const end = new Date(sorted[i + 1].timestamp).getTime();
        totalHours += (end - start) / (1000 * 60 * 60);
      }
    }

    return totalHours.toFixed(2);
  };

  const sortedCheckIns = [...checkIns].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                {format(date, 'EEEE, MMMM d, yyyy')}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Total hours: {calculateDailyHours()}h
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={24} className="text-gray-600" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="space-y-4">
              {sortedCheckIns.map((ci) => (
                <div
                  key={ci.id}
                  className={`border-2 rounded-lg p-4 ${
                    ci.action === 'check-in'
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-lg ${
                        ci.action === 'check-in' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {ci.action === 'check-in' ? (
                          <CheckCircle className="text-green-600" size={24} />
                        ) : (
                          <XCircle className="text-red-600" size={24} />
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <User size={16} className="text-gray-600" />
                          <span className="font-semibold text-gray-800">
                            {ci.caregiver_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                          <Clock size={16} />
                          <span>{format(new Date(ci.timestamp), 'HH:mm:ss')}</span>
                        </div>

                        {ci.latitude && ci.longitude && (
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                            <MapPin size={16} />
                            <span>
                              Location: {ci.latitude.toFixed(6)}, {ci.longitude.toFixed(6)}
                            </span>
                          </div>
                        )}

                        {ci.photo_url && (
                          <button
                            onClick={() => setShowPhoto(ci.photo_url!)}
                            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            <Camera size={16} />
                            View photo
                          </button>
                        )}
                      </div>
                    </div>

                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      ci.action === 'check-in'
                        ? 'bg-green-200 text-green-800'
                        : 'bg-red-200 text-red-800'
                    }`}>
                      {ci.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Day Notes Section */}
            {checkIns.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <DayNotesSection
                  beneficiaryId={checkIns[0].beneficiary_id}
                  date={date}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Photo Modal */}
      {showPhoto && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60] p-4"
          onClick={() => setShowPhoto(null)}
        >
          <div className="relative max-w-4xl w-full">
            <button
              onClick={() => setShowPhoto(null)}
              className="absolute top-4 right-4 bg-white rounded-full p-2 hover:bg-gray-100"
            >
              <X size={24} />
            </button>
            <img src={showPhoto} alt="Check-in photo" className="w-full rounded-lg" />
          </div>
        </div>
      )}
    </>
  );
}
