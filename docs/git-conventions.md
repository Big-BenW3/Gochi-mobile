# Git commit conventions — Gochi

## Attribution: none

**Never add `Co-Authored-By`, `Generated with`, or any AI/tool attribution trailer to a
commit message.** The repo is submitted to judges, and the user has asked for commits that
list only their own name.

Author and committer should both be the user's own identity:

```
Your Name <bcbandit17@gmail.com>
```

To verify a commit before pushing:

```bash
git log -1 --format='%an <%ae>%n%cn <%ce>'
git log -1 --format='%(trailers)'   # should be empty
```

## Scope

Commit per phase, not per file. Each phase in `PLAN.md` should land as one readable series
of commits, and `npm run ci` must pass before a phase is called done.

## Type

Conventional Commits prefixes, matching what is already in the history:

```
chore:   repo structure, tooling, dependency bumps
feat:    new user-visible capability
fix:     bug fix
refactor: behaviour-preserving restructure
docs:    documentation only
test:    tests only
```