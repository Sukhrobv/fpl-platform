// lib/fplClient.ts – FPL API client
//
// This module provides a typed client for the public Fantasy Premier League (FPL)
// API. It uses the built‑in fetch API available in modern Node runtimes to
// retrieve JSON data from the FPL endpoints. The base URL is taken from the
// environment configuration (see lib/env.ts) so it can be overridden via
// environment variables if necessary.

import { env } from "./env";
import type { FPLBootstrapData } from "../types";

/**
 * Generic helper to perform a GET request against the FPL API and return
 * parsed JSON. Throws an error if the response is not successful.
 */
async function fplGet<T>(path: string): Promise<T> {
  const url = `${env.FPL_API_BASE_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FPL API request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * Fetches the bootstrap data containing summary information about all teams,
 * players (elements) and events. This endpoint is the primary source for
 * building local caches of teams and players.
 *
 * Endpoint: `/bootstrap-static/`
 * Docs: https://www.oliverlooney.com/blogs/FPL-APIs-Explained#1-general-information
 */
export async function getBootstrapData(): Promise<FPLBootstrapData> {
  return fplGet<FPLBootstrapData>("/bootstrap-static/");
}

/**
 * Fetches the list of fixtures. If an eventId (gameweek) is provided the
 * results are filtered to that gameweek. Otherwise all fixtures are returned.
 *
 * Endpoint: `/fixtures/` or `/fixtures/?event={event_id}`
 */
export async function getFixtures(eventId?: number) {
  const query = eventId != null ? `?event=${eventId}` : "";
  return fplGet<any>(`/fixtures/${query}`);
}

/**
 * Fetches detailed statistics for a specific player (element) by id. This
 * includes historical and current season stats and is useful for advanced
 * analytics.
 *
 * Endpoint: `/element-summary/{element_id}/`
 */
export async function getPlayerSummary(elementId: number) {
  return fplGet<any>(`/element-summary/${elementId}/`);
}

/**
 * Fetches live data for a given gameweek. The FPL API returns aggregated
 * statistics for every player in the specified event (gameweek).
 *
 * Endpoint: `/event/{event_id}/live/`
 */
export async function getEventLive(eventId: number) {
  return fplGet<any>(`/event/${eventId}/live/`);
}

export default {
  getBootstrapData,
  getFixtures,
  getPlayerSummary,
  getEventLive,
};