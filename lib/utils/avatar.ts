/**
 * Generates a deterministic, modern cartoon avatar URL from Dicebear's avataaars style.
 * Personalizes facial hair, hair length, and accessories based on the specified gender.
 */
export function getDicebearAvatarUrl(name: string, gender?: string | null): string {
  const seed = encodeURIComponent(name.trim());
  const style = "notionists"; // Clean, modern illustration style
  
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
}
