# Security policy

## Supported versions

Only the latest release of TimeCount gets security fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately with GitHub's [private vulnerability reporting](https://github.com/BrahmjotSingh0/timecount/security/advisories/new). If you cannot use that, email brahmjots111@gmail.com.

Please include:

- what you found and why it matters
- the steps to reproduce it
- your TimeCount and VS Code versions and your operating system

I will reply as soon as I can, and I will tell you when it is fixed.

## What is in scope

TimeCount has no network code. It only writes dates, durations, folder names and language names to its own storage folder on your computer. Reports are welcome about things like:

- reading or writing files outside that folder
- the dashboard page running script it should not, or loading anything from the internet
- data files being handled unsafely, for example a crafted file breaking the extension
