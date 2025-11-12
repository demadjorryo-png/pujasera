# AI setup (OpenAI / Genkit)

This document explains how to configure the OpenAI key for local development and CI, and how to run the included server-side check script.

## Environment variable

Set the following environment variable in your development `.env` file (DO NOT commit `.env`):

OPENAI_API_KEY=sk-...

In production, configure this key in your hosting provider's secret manager (Vercel, Firebase, Cloud Run, etc.). Do not use `NEXT_PUBLIC_` prefix for this secret.

## Local check script

A small server-side check script is available at `scripts/check-ai-setup.ts`. It dynamically imports `genkit` and `genkit/plugins/openai` and attempts to initialize Genkit with the configured key (no network calls performed).

Run it locally with:

```powershell
# PowerShell (Windows)
npm run check-ai-setup

# or with npx/tsx
npx tsx ./scripts/check-ai-setup.ts
```

Exit codes:
- 0: OK — key present and genkit initialized locally
- 2: OPENAI_API_KEY missing
- 3: Import/initialization failure (check dependencies)

## GitHub Actions / CI

A CI workflow is included that runs TypeScript `typecheck` on PRs and pushes. The workflow also attempts the AI setup check if you provide `OPENAI_API_KEY` as a repository secret (optional):

- Add secret: `OPENAI_API_KEY` in GitHub repository settings if you want the workflow to run `npm run check-ai-setup`.

## Notes

- `src/ai/genkit.ts` includes runtime guards to prevent accidental client-side imports and validates the presence of the env key in production.
- `next.config.ts` is configured to avoid bundling `genkit` and `@genkit-ai/*` packages into client bundles.

If you'd like, I can add a small section that shows how to rotate or revoke keys and how to use a secret manager for specific providers (Vercel/Firebase/GCP).

## Example request (proxy endpoint)

The repository includes a small server-side proxy endpoint at `/api/ai/proxy/receipt-promo` that calls the receipt promo AI flow. Example request body and curl command:

```bash
curl -X POST https://your-app.example.com/api/ai/proxy/receipt-promo \
	-H "Content-Type: application/json" \
	-d '{
		"input": {
			"activePromotions": [
				"Diskon 10% untuk minuman semua hari Selasa",
				"Beli 2 gratis 1 untuk kue tertentu"
			]
		}
	}'
```

Example response (successful):

```json
{
	"promoText": "Dapatkan diskon 10% untuk minuman setiap Selasa — hanya untuk pelanggan setia kami!"
}
```

Adjust the domain and payload to match your app and the flow's expected input shape.