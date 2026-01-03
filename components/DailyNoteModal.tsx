'use client';

import { useState, useEffect } from 'react';
import { X, Save, Trash2, StickyNote } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useLanguage } from '@/contexts/LanguageContext';

type DailyNoteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  beneficiaryId: string;
  date: Date;
  existingNote?: string;
  onSave: (note: string) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export default function DailyNoteModal({
  isOpen,
  onClose,
  beneficiaryId,
  date,
  existingNote,
  onSave,
  onDelete,
}: DailyNoteModalProps) {
  const { language } = useLanguage();
  const [note, setNote] = useState(existingNote || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setNote(existingNote || '');
  }, [existingNote, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!note.trim()) return;

    setSaving(true);
    try {
      await onSave(note);
      onClose();
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    if (!confirm(language === 'fr' ? 'Supprimer cette note ?' : 'Delete this note?')) {
      return;
    }

    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (error) {
      console.error('Error deleting note:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <StickyNote className="text-orange-600" size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {language === 'fr' ? 'Note du jour' : 'Daily Note'}
              </h3>
              <p className="text-sm text-gray-600">
                {format(date, language === 'fr' ? 'dd MMMM yyyy' : 'MMMM dd, yyyy', {
                  locale: language === 'fr' ? fr : undefined,
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {language === 'fr' ? 'Note' : 'Note'}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
            rows={6}
            placeholder={
              language === 'fr'
                ? 'Ex: Visite annulée, Aide-soignant absent, etc.'
                : 'Ex: Visit canceled, Caregiver absent, etc.'
            }
            autoFocus
          />
          <p className="text-xs text-gray-500 mt-1">
            {language === 'fr'
              ? 'Cette note apparaîtra en orange sur le calendrier et dans l\'historique.'
              : 'This note will appear in orange on the calendar and in the history.'}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !note.trim()}
            className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {language === 'fr' ? 'Enregistrement...' : 'Saving...'}
              </>
            ) : (
              <>
                <Save size={20} />
                {language === 'fr' ? 'Enregistrer' : 'Save'}
              </>
            )}
          </button>

          {existingNote && onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {deleting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Trash2 size={20} />
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {language === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
