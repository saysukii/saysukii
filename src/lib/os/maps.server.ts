export type PlaceSuggestion = {
  id: string;
  label: string;
  value: string;
  provider: "google" | "fallback";
};

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
};

function mapsKey() {
  return process.env["GOOGLE_MAPS_API_KEY"]?.trim() || "";
}

export function googleMapsConfigured() {
  return mapsKey().length > 0;
}

export async function searchGooglePlaces(query: string): Promise<PlaceSuggestion[] | null> {
  const key = mapsKey();
  if (!key) return null;

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    signal: AbortSignal.timeout(1200),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ["us"],
      locationBias: {
        rectangle: {
          low: { latitude: 24.3963, longitude: -87.6348 },
          high: { latitude: 31.0007, longitude: -79.9743 },
        },
      },
    }),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as GoogleAutocompleteResponse;
  const seen = new Set<string>();
  const suggestions: PlaceSuggestion[] = [];

  for (const suggestion of payload.suggestions ?? []) {
    const prediction = suggestion.placePrediction;
    const main = prediction?.structuredFormat?.mainText?.text?.trim();
    const secondary = prediction?.structuredFormat?.secondaryText?.text?.trim();
    const full = prediction?.text?.text?.trim() || [main, secondary].filter(Boolean).join(", ");
    if (!full || seen.has(full)) continue;
    seen.add(full);
    suggestions.push({
      id: prediction?.placeId || full,
      label: secondary && main ? `${main} — ${secondary}` : full,
      value: full,
      provider: "google",
    });
    if (suggestions.length >= 6) break;
  }

  return suggestions;
}
