/**
 * Units run concurrently against the same AI throttle as every other workflow.
 * Kept modest deliberately: the win here comes from narrower prompts, not from
 * saturating the model gate, and a control rarely plans more than a few dozen
 * units.
 */
