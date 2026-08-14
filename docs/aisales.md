# This install is Aerolot aisales

This folder is the CRM for `aisales.aerolot.ai`.

The product stack is Comp AI CRM: Nest, Prisma, Next.js, eve. That is the
correct codebase. The GitHub home is Aerolot's fork, not the public Comp AI
repo.

## Git remotes

| Remote | URL | Use |
| --- | --- | --- |
| `origin` | `https://github.com/Aerolot-ai/crm.git` | Fetch and push. This is ours. |
| `upstream` | `https://github.com/trycompai/crm` | Fetch only. Public open source. Never push. |

`git push` goes to `Aerolot-ai/crm`. Live aisales deploys from that repo's
`release` branch.

## Never

- Do not push to `trycompai/crm`. That repo is Comp AI open source. It is not
  ours.
- Do not open aisales PRs against `trycompai/crm`.
- Do not use `trycrm-convex`. That is a different product on Convex. Path:
  `/home/david/firstmate/projects/trycrm-convex`. Aisales does not use Convex.

## Same stack, different GitHub

`trycompai/crm` is the upstream product we cloned from. We keep that
architecture. We do not ship aisales work back to that GitHub.

If a remote named `origin` points at `trycompai/crm`, fix it:

```sh
git remote rename origin upstream
git remote rename aerolot origin
git remote set-url --push upstream no_push
```

If `aerolot` is already gone and `origin` is wrong:

```sh
git remote set-url origin https://github.com/Aerolot-ai/crm.git
git remote add upstream https://github.com/trycompai/crm
git remote set-url --push upstream no_push
```
