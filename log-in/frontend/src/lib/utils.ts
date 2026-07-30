import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combines conditional class names (clsx) and resolves Tailwind class
 * conflicts in favor of the last one specified (tailwind-merge) -- the
 * standard pairing for components that accept a `className` override prop. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
