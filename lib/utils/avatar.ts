/**
 * Generates a deterministic, modern cartoon avatar URL from Dicebear's avataaars style.
 * Personalizes facial hair, hair length, and accessories based on the specified gender.
 */
export function getDicebearAvatarUrl(name: string, gender?: string | null): string {
  const seed = encodeURIComponent(name.trim());
  const style = "avataaars"; // Clean, modern cartoon personas
  
  let options = "accessoriesProbability=0";
  
  if (gender) {
    const g = gender.toLowerCase();
    if (g === "female") {
      // Feminine styles: no facial hair, longer hair options
      options += "&facialHairProbability=0&top[]=longHair,bob,curly,dreads,hijab,turban,dreads&mouth[]=smile,default,eating,serious";
    } else if (g === "male") {
      // Masculine styles: shorter hair options, moderate facial hair probability
      options += "&top[]=shortHair,classic01,classic02,frizzle,shaggy&facialHairProbability=35";
    }
  }
  
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&${options}`;
}
