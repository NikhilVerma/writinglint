# Security Policy

## Supported versions

WritingLint and Sloplint are pre-1.0 projects. Security fixes are applied to the
latest release only. Upgrade to the newest published version before reporting a
problem that may already be fixed.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's **Report a vulnerability** form in this repository's Security tab.
If private vulnerability reporting is not available, contact the maintainer
using the email address published on the
[maintainer's GitHub profile](https://github.com/NikhilVerma).

Include, where possible:

- the affected package and version;
- impact and realistic attack scenario;
- minimal reproduction or proof of concept;
- suggested mitigation; and
- whether any details are already public.

You should receive an acknowledgement within seven days. The maintainer will
coordinate validation, a fix, and disclosure timing with you. Please allow a
reasonable remediation window before public disclosure.

## Scope

Security issues include arbitrary code execution, unsafe model or archive
handling, path traversal, credential disclosure, dependency confusion, and
malicious files that escape Sloplint's intended local-file boundary. Ordinary
false positives, missed lint findings, and model-quality reports belong in the
public issue tracker.
