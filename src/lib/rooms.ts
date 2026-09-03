// Room catalog for Admin's Class Management — lets a section's room be picked from a managed
// list instead of freely typed, the same way src/lib/subjects.ts backs the subject picker.

import { supabase } from '../supabase';

export interface Room {
  id: string;
  name: string;
}

export async function listRooms(): Promise<Room[]> {
  const { data, error } = await supabase.from('rooms').select('id, name').order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Room[];
}

export async function createRoom(name: string): Promise<Room> {
  const { data, error } = await supabase
    .from('rooms')
    .insert({ name: name.trim() })
    .select('id, name')
    .single();
  if (error) throw error;
  return data as Room;
}

export async function updateRoom(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('rooms').update({ name: name.trim() }).eq('id', id);
  if (error) throw error;
}

// class_sections.room stores the room's name as plain text (not a foreign key), so unlike
// subjects (which are referenced by id and get a real FK violation) we have to check usage
// ourselves before deleting.
export async function deleteRoom(id: string, name: string): Promise<string | null> {
  const { count, error: checkError } = await supabase
    .from('class_sections')
    .select('id', { count: 'exact', head: true })
    .eq('room', name);
  if (checkError) return checkError.message;
  if (count && count > 0) {
    return 'This room is still assigned to a class and cannot be deleted. Remove it from every class first.';
  }
  const { error } = await supabase.from('rooms').delete().eq('id', id);
  if (error) return error.message;
  return null;
}
