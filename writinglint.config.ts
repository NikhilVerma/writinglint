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
import { recommended as craft } from "writinglint-rulepack-craft";

export default defineConfig({
    // Layer both packs: ai-style catches what models do (overclaiming);
    // craft catches what people do (underclaiming, flat rhythm). They compose cleanly.
    extends: [aiStyle, craft],

    rules: {
        // …then override. Writing casual prose? Silence the emoji rule:
        // 'ai-style/emoji': 'off',

        // Promote the construction that started this project to an error:
        "ai-style/corrective-antithesis": "error"
    }

    // Register your own rulepack and enable its rules the same way:
    // plugins: { house: houseStyle },
    // rules: { 'house/no-oxford-comma': 'warn' },
});
