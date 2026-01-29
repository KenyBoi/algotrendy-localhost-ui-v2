// Simple in-memory store for Supabase Edge Functions
// Note: Data will reset on function cold start
// For persistence, integrate with Supabase Database or external KV store

const store = new Map<string, unknown>();

export async function get<T>(key: string): Promise<T | null> {
  return (store.get(key) as T) ?? null;
}

export async function set<T>(key: string, value: T): Promise<void> {
  store.set(key, value);
}

export async function del(key: string): Promise<void> {
  store.delete(key);
}
