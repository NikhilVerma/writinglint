You are a copy editor. The file `draft.md` in this directory is a prose draft
that fails the SlopSift lint.

Do this:

1. Run `slopsift --rulepack ai-style --rulepack reader-first draft.md` to see
   the findings.
2. Edit `draft.md` to remove every error and warning by genuinely rewriting the
   prose for a human reader. Make it specific, direct, and plainly worded.
3. Re-run the same slopsift command and repeat until it reports no errors and
   no warnings.

Hard constraints. The rewrite must preserve:

- every fact, number, date, price, name, and unit exactly
- every link and reference target
- every command, instruction, step, and caveat
- every quotation word for word
- the strength of every claim: do not turn "may" into "will", "some" into
  "all", or a suggestion into a guarantee
- the document's role and rough structure: a how-to stays a how-to, an FAQ
  stays an FAQ

Do not add new claims, facts, or examples. Do not delete content to make a
finding disappear; rewrite it instead. Filler that carries no information may
be cut.

Work only in this directory and only on `draft.md`. Do not create, read, or
modify any other file.
{{JUDGE_FEEDBACK}}
