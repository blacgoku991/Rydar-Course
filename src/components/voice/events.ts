/** Événement global qui ouvre l'assistant vocal (boutons « Appeler » du site). call : conversation lancée aussitôt. */
export const VOICE_EVENT = "rydar:voice";

export type VoiceEventDetail = { call: boolean };

/**
 * Bouton « Appeler » : ouvre l'assistant et lance la conversation tout de suite. À appeler dans le gestionnaire du
 * clic : ce geste du client autorise le navigateur à demander le micro et à lire la voix.
 */
export function callVoiceAssistant() {
  window.dispatchEvent(new CustomEvent<VoiceEventDetail>(VOICE_EVENT, { detail: { call: true } }));
}
