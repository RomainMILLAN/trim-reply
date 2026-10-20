.DEFAULT_GOAL = help
SHELL:=/bin/bash

export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)

# Every yarn command runs inside the node container, never on the host.
DC   := docker compose
YARN := $(DC) exec -T node yarn

CURRENT_VERSION := $(shell sed -nE 's/.*"version": "([^"]+)".*/\1/p' package.json | head -1)

.PHONY: help
help:
	@grep -E '(^([a-zA-Z_-]+ ?)+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[32m%-30s\033[0m %s\n", $$1, $$2}' | sed -e 's/\[32m##/[33m/'

##
## —— Container 🐳 ————————————————
.PHONY: up
up: ## Start the node container
	@$(DC) up -d --wait

.PHONY: down
down: ## Stop the node container
	@$(DC) down

##
## —— Version 🔖 ————————————————
.PHONY: bump
bump: ## Bump the version (package.json + manifest), e.g. make bump VERSION=1.0.1
	@if [ -z "$(VERSION)" ]; then echo "Usage: make bump VERSION=x.y.z (current: $(CURRENT_VERSION))"; exit 1; fi
	@sed -i -E 's/("version": ")[^"]*(")/\1$(VERSION)\2/' package.json src/manifest.json
	@echo "🔖 Version: $(CURRENT_VERSION) → $(VERSION)"

.PHONY: tag
tag: ## Create the signed git tag for the current version (triggers the release workflow)
	@git tag -s v$(CURRENT_VERSION) -m "v$(CURRENT_VERSION)"
	@echo "🏷️  Signed tag v$(CURRENT_VERSION) created. Push it: git push origin v$(CURRENT_VERSION)"

##
## —— Build 📦 ————————————————
.PHONY: install
install: up ## Install dependencies without running install scripts
	@$(YARN) install --frozen-lockfile --ignore-scripts

.PHONY: test
test: up ## Run the test suite
	@$(YARN) test

.PHONY: icons
icons: up ## Regenerate the icons
	@$(YARN) icons

.PHONY: sync-signature
sync-signature: ## Resync the vendored author signature and fail if the copy drifted
	@node scripts/sync-signature.mjs
	@git diff --exit-code src/ui/author-signature.css

.PHONY: lint
lint: up ## Validate the Firefox package with addons-linter
	@$(YARN) lint

.PHONY: build
build: up ## Build the Chrome and Firefox packages
	@$(YARN) build:chrome
	@$(YARN) build:firefox

.PHONY: sign-firefox
sign-firefox: up ## Sign the Firefox xpi via AMO (needs WEB_EXT_API_KEY / WEB_EXT_API_SECRET)
	@$(DC) exec -T -e WEB_EXT_API_KEY -e WEB_EXT_API_SECRET node yarn sign:firefox

.PHONY: clean
clean: ## Remove generated directories
	@rm -rf build web-ext-artifacts
	@echo "🧹 build/ and web-ext-artifacts/ removed"
