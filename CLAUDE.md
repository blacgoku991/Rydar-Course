# RYDAR Privé — notes pour les assistants

Site Next.js 16 (App Router, Turbopack) : réservation de chauffeurs FR/EN, assistant téléphonique ElevenLabs, centrale Telegram.

## Important

- Next.js 16 diffère des versions connues (ex. `middleware` → `src/proxy.ts`, `params` asynchrones). Lire `node_modules/next/dist/docs/` avant de modifier une convention.
- Les prix sont calculés uniquement côté serveur (`src/lib/pricing.ts`) et signés (`src/lib/quote-token.ts`). Ne jamais faire confiance à un prix venant du navigateur.
- Toute nouvelle clé de texte doit exister dans `src/i18n/fr.ts` **et** `src/i18n/en.ts` (le type `Dictionary` l'impose).
- Configuration métier dans `src/config/*` ; secrets uniquement via variables d'environnement (voir `.env.example`).
- Le trait d'union / tiret / € de Bodoni Moda sont des filets invisibles : la police "Rydar Hyphen" (globals.css) les remplace, ne pas la retirer.

## Commandes

- `npm run dev` · `npm run build` · `npm test` · `npm run check` (prettier + tsc + vitest)

## Flux

- Site : `/api/places` (lieux connus + Géoplateforme IGN + Photon) → `/api/quote` (devis signé) → `/api/booking` → `postBookingToCentral` (Telegram).
- Téléphone : ElevenLabs appelle `/api/agent/quote` puis `/api/agent/booking` (en-tête `X-Agent-Secret`), récap via `/api/agent/post-call`.
- Telegram : boutons `rp:<action>:<ref>` traités par `/api/telegram/webhook` ; état lu depuis le message lui-même (sans base de données), verrou via `src/lib/store.ts` (Upstash si configuré).
- `/setup` (protégé par `APP_SECRET`) branche le webhook Telegram et crée/met à jour l'agent ElevenLabs et le numéro Twilio.
