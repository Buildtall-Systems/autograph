.PHONY: help lint fmt test build build-listed dev dev-firefox zip zip-listed sign release icons tile

NIX := nix develop -c
BUMP ?= patch
VERSION = $(shell $(NIX) node -p "require('./package.json').version")

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

build: ## build chrome-mv3 and unlisted firefox-mv2
	$(NIX) npm run build
	$(NIX) npm run build:firefox

build-listed: ## build the AMO-listed firefox-mv2 variant (no update_url, canonical version)
	AUTOGRAPH_CHANNEL=listed $(NIX) npm run build:firefox

dev: ## dev mode, chromium
	$(NIX) npm run dev

dev-firefox: ## dev mode, firefox
	$(NIX) npm run dev:firefox

zip: ## package both targets
	$(NIX) npm run zip
	$(NIX) npm run zip:firefox

zip-listed: ## package the listed firefox zip + sources zip into dist/
	AUTOGRAPH_CHANNEL=listed $(NIX) npm run zip:firefox
	mkdir -p dist
	cp .output/autograph-$(VERSION)-firefox.zip dist/autograph-$(VERSION)-listed.xpi
	cp .output/autograph-$(VERSION)-sources.zip dist/autograph-$(VERSION)-sources.zip

sign: ## AMO unlisted signing of the firefox build (WEB_EXT_API_KEY/SECRET from keyring via secretspec)
	$(NIX) secretspec run --provider keyring -- npx web-ext sign --source-dir .output/firefox-mv2 --artifacts-dir dist --channel unlisted

release: ## version bump + listed zips + builds + chrome zip + unlisted sign (BUMP=patch|minor|major)
	$(NIX) npm version $(BUMP) --no-git-tag-version
	$(MAKE) zip-listed build zip sign

icons: ## rasterize assets/icon.svg to public/icon/{16,32,48,96,128}.png
	for s in 16 32 48 96 128; do rsvg-convert -w $$s -h $$s assets/icon.svg -o public/icon/$$s.png; done

tile: ## render the 440x280 CWS promo tile from assets/store-promo.svg
	mkdir -p assets/store
	rsvg-convert -w 440 -h 280 assets/store-promo.svg -o assets/store/promo-440x280.png
