export function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}
