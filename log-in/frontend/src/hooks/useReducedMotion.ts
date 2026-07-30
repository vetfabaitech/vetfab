import { useEffect, useState } from "react";

/** Tracks `prefers-reduced-motion`, live. Framer Motion variants read this
 * to drop transform/opacity choreography down to an instant, near-zero-
 * duration fade instead of skipping the state change entirely -- content
 * still appears, just without the motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
