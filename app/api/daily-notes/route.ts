import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - Fetch notes for a beneficiary and date range
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const beneficiaryId = searchParams.get('beneficiary_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!beneficiaryId) {
      return NextResponse.json(
        { error: 'beneficiary_id is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('day_notes')
      .select('*')
      .eq('beneficiary_id', beneficiaryId);

    if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate);
    }

    const { data, error } = await query.order('date', { ascending: false });

    if (error) {
      console.error('Error fetching day notes:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ notes: data });
  } catch (error: any) {
    console.error('Day notes GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create or update a note for a specific date
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { beneficiary_id, date, note_type, reason, created_by } = body;

    console.log('Received note data:', { beneficiary_id, date, note_type, reason, created_by });

    if (!beneficiary_id || !date || !reason) {
      console.error('Missing required fields:', { beneficiary_id, date, reason });
      return NextResponse.json(
        { error: 'beneficiary_id, date, and reason are required' },
        { status: 400 }
      );
    }

    // Check if note exists for this date
    const { data: existing } = await supabase
      .from('day_notes')
      .select('id')
      .eq('beneficiary_id', beneficiary_id)
      .eq('date', date)
      .single();

    let result;
    if (existing) {
      // Update existing note
      console.log('Updating existing note:', existing.id);
      result = await supabase
        .from('day_notes')
        .update({
          note_type: note_type || 'general',
          reason: reason.trim(),
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new note
      console.log('Inserting new note');
      result = await supabase
        .from('day_notes')
        .insert({
          beneficiary_id,
          date,
          note_type: note_type || 'general',
          reason: reason.trim(),
          created_by,
        })
        .select()
        .single();
    }

    console.log('Supabase result:', { data: result.data, error: result.error });

    if (result.error) {
      console.error('Error saving day note:', result.error);
      return NextResponse.json(
        { error: 'Failed to save note', details: result.error },
        { status: 500 }
      );
    }

    console.log('Note saved successfully');
    return NextResponse.json({ success: true, note: result.data });
  } catch (error: any) {
    console.error('Day notes POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a note
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get('id');
    const beneficiaryId = searchParams.get('beneficiary_id');
    const date = searchParams.get('date');

    if (!noteId && (!beneficiaryId || !date)) {
      return NextResponse.json(
        { error: 'Either id or (beneficiary_id and date) is required' },
        { status: 400 }
      );
    }

    let query = supabase.from('day_notes').delete();

    if (noteId) {
      query = query.eq('id', noteId);
    } else {
      query = query.eq('beneficiary_id', beneficiaryId!).eq('date', date!);
    }

    const { error } = await query;

    if (error) {
      console.error('Error deleting day note:', error);
      return NextResponse.json(
        { error: 'Failed to delete note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Day notes DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
