/** Événement global qui ouvre l'assistant vocal (bouton flottant, barre mobile, section téléphone). */
export const VOICE_EVENT = "rydar:voice";

export function openVoiceAssistant() {
  window.dispatchEvent(new Event(VOICE_EVENT));
}
