"use client";

import { callVoiceAssistant } from "./events";

/**
 * Bouton « Appeler » : pas de ligne téléphonique, l'assistant vocal répond directement sur le site (même agent que
 * le téléphone). Un appui ouvre l'assistant et lance la conversation.
 */
export default function CallButton({
  label,
  className,
  ariaLabel,
  tabIndex,
  onClick,
}: {
  label?: string;
  className?: string;
  ariaLabel?: string;
  tabIndex?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      tabIndex={tabIndex}
      onClick={() => {
        onClick?.();
        callVoiceAssistant();
      }}
    >
      <PhoneIcon />
      {label && <span>{label}</span>}
    </button>
  );
}

export function PhoneIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
    </svg>
  );
}
