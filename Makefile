.PHONY: help lint fmt test build dev dev-firefox zip sign updates release

NIX := nix develop -c
BUMP ?= patch

help: ## list targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "%-12s %s\n", $$1, $$2}'

lint: ## eslint + prettier check + typecheck
	$(NIX) npm run lint
	$(NIX) npm run fmt:check
	$(NIX) npm run compile

fmt: ## format with prettier
	$(NIX) npm run fmt

test: ## run vitest
	$(NIX) npm run test

build: ## build chrome-mv3 and firefox-mv2
	$(NIX) npm run build
	$(NIX) npm run build:firefox

dev: ## dev mode, chromium
	$(NIX) npm run dev

dev-firefox: ## dev mode, firefox
	$(NIX) npm run dev:firefox

zip: ## package both targets
	$(NIX) npm run zip
	$(NIX) npm run zip:firefox

sign: ## AMO unlisted signing of the firefox build (WEB_EXT_API_KEY/SECRET from operator env)
	$(NIX) npx web-ext sign --source-dir .output/firefox-mv2 --artifacts-dir dist --channel unlisted

updates: ## generate dist/updates.json for the current version
	$(NIX) node scripts/gen-updates.ts

release: ## version bump + build + zip + sign + updates.json (BUMP=patch|minor|major)
	$(NIX) npm version $(BUMP) --no-git-tag-version
	$(MAKE) build zip sign updates
