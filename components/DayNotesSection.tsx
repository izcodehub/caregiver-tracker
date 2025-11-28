'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Edit, Trash2, AlertCircle, X } from 'lucide-react';

type DayNote = {
  id: string;
  beneficiary_id: string;
  date: string;
  note_type: 'modification' | 'cancellation' | 'special_instruction' | 'general';
  original_time?: string;
  modified_time?: string;
  reason?: string;
  created_at: string;
};

type DayNotesSectionProps = {
  beneficiaryId: string;
  date: Date;
  onNotesChange?: () => void;
};

export default function DayNotesSection({ beneficiaryId, date, onNotesChange }: DayNotesSectionProps) {
  const [notes, setNotes] = useState<DayNote[]>([]);
  const [showAddNote, setShowAddNote] = useState(false);
  const [loading, setLoading] = useState(true);

  const [noteType, setNoteType] = useState<'modification' | 'cancellation' | 'special_instruction' | 'general'>('general');
  const [originalTime, setOriginalTime] = useState('');
  const [modifiedTime, setModifiedTime] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    loadNotes();
  }, [beneficiaryId, date]);

  const loadNotes = async () => {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('day_notes')
        .select('*')
        .eq('beneficiary_id', beneficiaryId)
        .eq('date', dateStr)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const dateStr = date.toISOString().split('T')[0];
      const { error } = await supabase
        .from('day_notes')
        .insert({
          beneficiary_id: beneficiaryId,
          date: dateStr,
          note_type: noteType,
          original_time: originalTime || null,
          modified_time: modifiedTime || null,
          reason: reason || null,
        });

      if (error) throw error;

      // Reset form
      setNoteType('general');
      setOriginalTime('');
      setModifiedTime('');
      setReason('');
      setShowAddNote(false);

      // Reload notes
      await loadNotes();
      onNotesChange?.();
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const { error } = await supabase
        .from('day_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;

      await loadNotes();
      onNotesChange?.();
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const getNoteTypeColor = (type: string) => {
    switch (type) {
      case 'modification':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'cancellation':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'special_instruction':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-600">Loading notes...</div>;
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Day Notes</h3>
        <button
          onClick={() => setShowAddNote(!showAddNote)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          {showAddNote ? <X size={14} /> : <Plus size={14} />}
          {showAddNote ? 'Cancel' : 'Add Note'}
        </button>
      </div>

      {/* Add Note Form */}
      {showAddNote && (
        <form onSubmit={handleAddNote} className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Note Type
              </label>
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as any)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="general">General Note</option>
                <option value="modification">Time Modification</option>
                <option value="cancellation">Cancellation</option>
                <option value="special_instruction">Special Instruction</option>
              </select>
            </div>

            {(noteType === 'modification' || noteType === 'cancellation') && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Original Time
                  </label>
                  <input
                    type="text"
                    value={originalTime}
                    onChange={(e) => setOriginalTime(e.target.value)}
                    placeholder="09:00-11:00"
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {noteType === 'modification' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Modified Time
                    </label>
                    <input
                      type="text"
                      value={modifiedTime}
                      onChange={(e) => setModifiedTime(e.target.value)}
                      placeholder="10:00-12:00"
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Reason / Notes
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Add details..."
                rows={2}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              Save Note
            </button>
          </div>
        </form>
      )}

      {/* Notes List */}
      {notes.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No notes for this day</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`p-3 rounded border ${getNoteTypeColor(note.note_type)}`}
            >
              <div className="flex items-start justify-between mb-1">
                <span className="text-xs font-semibold capitalize">
                  {note.note_type.replace('_', ' ')}
                </span>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="text-gray-500 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {note.original_time && (
                <div className="text-xs mb-1">
                  <span className="font-medium">Original:</span> {note.original_time}
                  {note.modified_time && (
                    <>
                      {' → '}
                      <span className="font-medium">Modified:</span> {note.modified_time}
                    </>
                  )}
                </div>
              )}

              {note.reason && (
                <p className="text-xs">{note.reason}</p>
              )}

              <div className="text-xs text-gray-600 mt-1">
                {new Date(note.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
