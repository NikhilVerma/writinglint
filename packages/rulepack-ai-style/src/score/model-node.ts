/**
 * Node-only loader for the trained classifier (data-free JSON: vocab + weights).
 * Kept out of the pack's main entry so the browser bundle never imports node:fs;
 * the web app fetches the same JSON over HTTP instead.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Model } from './classifier.js';

/** Absolute path to the shipped model file (packages/rulepack-ai-style/model/). */
export const MODEL_PATH = fileURLToPath(new URL('../../model/classifier.json', import.meta.url));

/** Load the trained model, or undefined if it hasn't been built yet. */
export function loadModelNode(): Model | undefined {
  return existsSync(MODEL_PATH) ? (JSON.parse(readFileSync(MODEL_PATH, 'utf8')) as Model) : undefined;
}
