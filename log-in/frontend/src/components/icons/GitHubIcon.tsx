/** GitHub "octocat mark" glyph -- monochrome, inherits currentColor so it
 * matches the button's text color in both themes without a separate asset. */
export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 0C5.37 0 0 5.5 0 12.3c0 5.44 3.44 10.05 8.21 11.68.6.11.82-.27.82-.6 0-.29-.01-1.26-.02-2.28-3.34.75-4.04-1.45-4.04-1.45-.55-1.44-1.34-1.82-1.34-1.82-1.1-.77.08-.76.08-.76 1.21.09 1.85 1.28 1.85 1.28 1.08 1.9 2.83 1.35 3.52 1.03.11-.8.42-1.35.76-1.66-2.67-.31-5.47-1.37-5.47-6.1 0-1.35.47-2.45 1.24-3.31-.12-.31-.54-1.57.12-3.28 0 0 1.01-.33 3.3 1.27a11.2 11.2 0 0 1 6 0c2.29-1.6 3.3-1.27 3.3-1.27.66 1.71.24 2.97.12 3.28.77.86 1.24 1.96 1.24 3.31 0 4.74-2.81 5.78-5.49 6.09.43.38.81 1.13.81 2.29 0 1.65-.02 2.98-.02 3.39 0 .33.22.72.83.6C20.56 22.34 24 17.74 24 12.3 24 5.5 18.63 0 12 0Z"
      />
    </svg>
  );
}
