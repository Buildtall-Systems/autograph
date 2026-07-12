.PHONY: help lint fmt test build dev dev-firefox zip

NIX := nix develop -c

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
