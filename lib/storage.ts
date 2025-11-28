import { supabase } from './supabase';

/**
 * Upload a photo to Supabase Storage
 * @param base64Photo - Base64 encoded photo string (data:image/jpeg;base64,...)
 * @param beneficiaryId - ID of the elderly person
 * @param timestamp - Timestamp for unique filename
 * @returns Public URL of the uploaded photo or null if failed
 */
export async function uploadPhoto(
  base64Photo: string,
  beneficiaryId: string,
  timestamp: string
): Promise<string | null> {
  try {
    // Convert base64 to blob
    const base64Data = base64Photo.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    // Create unique filename: elderly-id/timestamp-random.jpg
    const randomSuffix = Math.random().toString(36).substring(7);
    const filename = `${beneficiaryId}/${timestamp}-${randomSuffix}.jpg`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('caregiver-photos')
      .upload(filename, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading photo:', error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('caregiver-photos')
      .getPublicUrl(filename);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Error processing photo:', error);
    return null;
  }
}

/**
 * Delete a photo from Supabase Storage
 * @param photoUrl - Full URL of the photo to delete
 * @returns True if deleted successfully
 */
export async function deletePhoto(photoUrl: string): Promise<boolean> {
  try {
    // Extract filename from URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/caregiver-photos/filename
    const urlParts = photoUrl.split('/caregiver-photos/');
    if (urlParts.length < 2) {
      console.error('Invalid photo URL format');
      return false;
    }

    const filename = urlParts[1];

    const { error } = await supabase.storage
      .from('caregiver-photos')
      .remove([filename]);

    if (error) {
      console.error('Error deleting photo:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error processing photo deletion:', error);
    return false;
  }
}

/**
 * Check if a URL is a base64 photo (old format) or storage URL (new format)
 */
export function isBase64Photo(photoUrl: string): boolean {
  return photoUrl.startsWith('data:image');
}
