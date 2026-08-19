import clsx, { type ClassValue } from "clsx";

// Single helper for building conditional Tailwind class strings, so components never
// hand-assemble template literals (which silently produce "undefined"/double spaces).
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
