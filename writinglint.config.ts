/**
 * WritingLint config — the reference for how to configure the linter.
 *
 * `defineConfig` layers rulepacks and rule settings, ESLint-flat-config style:
 *   - `extends` pulls in preset configs (later entries win)
 *   - `plugins` maps a namespace to a rulepack (yours or a third party's)
 *   - `rules` turns rules on/off ('off' | 'warn' | 'error') and tunes options
 *
 * The CLI picks this file up automatically from the working directory.
 */
import { defineConfig } from "writinglint-core";
import { recommended as aiStyle } from "writinglint-rulepack-ai-style";
import { recommended as conviction } from "writinglint-rulepack-conviction";

export default defineConfig({
    // Layer both packs: ai-style catches what models do (overclaiming);
    // conviction catches what people do (underclaiming). They compose cleanly.
    extends: [aiStyle, conviction],

    rules: {
        // …then override. Linting Markdown? Silence the format-artifact rules:
        // 'ai-style/markdown-bold': 'off',
        // 'ai-style/markdown-heading': 'off',
        // 'ai-style/emoji': 'off',

        // Promote the construction that started this project to an error:
        "ai-style/corrective-antithesis": "error"
    }

    // Register your own rulepack and enable its rules the same way:
    // plugins: { house: houseStyle },
    // rules: { 'house/no-oxford-comma': 'warn' },
});
