# 11. Claude Code skills for this project

Skills are folders of instructions Claude Code loads when a task matches.
Project skills go in `.claude/skills/<skill-name>/SKILL.md`; plugin
marketplaces install with `/plugin` commands inside Claude Code.

> Third-party skills run with your permissions. Read each `SKILL.md` before
> installing, and check the install command against the repo's own README.

## Recommended

| Priority | Skill | Source | Why for Cloud Box |
|----------|-------|--------|-------------------|
| Must | `brainstorming`, `writing-plans` | obra/superpowers | Turn each milestone into a spec and a step-by-step plan |
| Must | `test-driven-development` | obra/superpowers | Tests first for box logic and crypto |
| Must | `systematic-debugging` | obra/superpowers | Structured debugging instead of guess-and-patch |
| Must | `verification-before-completion` | obra/superpowers | Runs tests and shows evidence before saying "done" |
| Must | `webapp-testing` | anthropics/skills | Playwright scripts to test the web app, with a server helper |
| Must | Go skills (`golang-safety`, testing, security, code style) | samber/cc-skills-golang | Idiomatic, safe Go for `boxd` |
| Must | Expo plugin (`expo-router`, `expo-data-fetching`, `expo-dev-client`, `expo-project-structure`) | Expo, official | Phone app structure, navigation, offline data |
| Should | `frontend-design` | anthropics/skills | Polished web UI that isn't generic |
| Should | `insecure-defaults`, `sharp-edges` | trailofbits/skills | Catch fail-open defaults and footgun APIs |
| Should | `spec-to-code-compliance` | trailofbits/skills | Check code against `docs/03-security-and-encryption.md` |
| Should | `property-based-testing` | trailofbits/skills | fast-check tests for crypto and sync |
| Should | `supply-chain-risk-auditor` | trailofbits/skills | Review Go and npm dependencies |
| Nice | `differential-review` | trailofbits/skills | Security review of each change before merging |
| Nice | `devcontainer-setup` | trailofbits/skills | Reproducible dev container (Linux or Windows) |
| Nice | `skill-creator` | anthropics/skills | Write the project skills below |

## Install

Inside Claude Code, from the project folder:

```
# obra/superpowers (MIT)
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace

# Expo official plugin (also registers the Expo MCP server)
/plugin install expo@claude-plugins-official

# Trail of Bits: add the marketplace, then pick plugins from the menu
/plugin marketplace add trailofbits/skills
/plugin menu
```

From a terminal in the project folder:

```
# samber Go skills (MIT)
npx skills add https://github.com/samber/cc-skills-golang --skill '*'

# Anthropic skills: copy the folders you want into .claude/skills/
git clone --depth 1 https://github.com/anthropics/skills /tmp/anthropic-skills
cp -r /tmp/anthropic-skills/skills/webapp-testing   .claude/skills/
cp -r /tmp/anthropic-skills/skills/frontend-design  .claude/skills/
cp -r /tmp/anthropic-skills/skills/skill-creator    .claude/skills/
```

Restart Claude Code after adding skills.

## Project skills to write later

Create these with `skill-creator` once the code exists:

| Skill | What it teaches Claude |
|-------|------------------------|
| `run-box-locally` | `make dev`, the sim page, resetting data, pairing the emulator |
| `add-api-endpoint` | OpenAPI first → regenerate client → handler → tests |
| `crypto-change` | Update vectors, run Go and TS checks, never weaken parameters |
| `deploy-to-pi` | Build, copy, install, check service and logs over SSH |

## Sources

- [Expo agent skills](https://docs.expo.dev/skills/)
- [Trail of Bits skills](https://github.com/trailofbits/skills)
- [obra/superpowers skill list](https://playbooks.com/skills/obra/superpowers)
- [samber/cc-skills-golang](https://www.sourcepulse.org/projects/26883768)
- [Anthropic webapp-testing skill](https://www.typingmind.com/skills/anthropics-webapp-testing)
