// Names stored on the Supabase user (user_metadata). Email sign-up saves
// first_name, last_name and full_name; Google supplies given_name and name.

interface NamedUser {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** First name for greetings, falling back to the full name, then the email. */
export function firstName(user: NamedUser | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  const first = text(meta.first_name) || text(meta.given_name);
  if (first) return first;
  const full = text(meta.full_name) || text(meta.name);
  if (full) return full.split(/\s+/)[0];
  return text(user?.email).split("@")[0];
}

export function lastName(user: NamedUser | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  const last = text(meta.last_name) || text(meta.family_name);
  if (last) return last;
  const full = text(meta.full_name) || text(meta.name);
  return full.split(/\s+/).slice(1).join(" ");
}

/** Metadata to save, keeping full_name for anything that reads it. */
export function nameMetadata(first: string, last: string) {
  const f = first.trim().slice(0, 50);
  const l = last.trim().slice(0, 50);
  return { first_name: f, last_name: l, full_name: [f, l].filter(Boolean).join(" ") };
}
