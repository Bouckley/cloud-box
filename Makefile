# Cloud Box developer commands. Run `make` for the list.
# Every path is quoted: the repo may live in a directory with spaces.

SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := help

DATA_DIR := $(CURDIR)/.data
DIST_DIR := $(CURDIR)/dist
VERSION  ?= $(shell git describe --always --dirty 2>/dev/null || echo dev)

.PHONY: help dev web test test-e2e test-arm64 build-pi reset-dev lint generate check-generated

help: ## List targets
	@grep -E '^[a-z0-9-]+:.*## ' Makefile | awk 'BEGIN {FS = ":.*## "} {printf "  %-16s %s\n", $$1, $$2}'

dev: ## Run boxd (simulated hardware, https://localhost:8443) and the web app (Vite, http://localhost:5173)
	DATA_DIR="$(DATA_DIR)" "$(CURDIR)/scripts/dev.sh"

web: ## Build the web app into box/web/dist (embedded by boxd)
	pnpm --filter @cloudbox/web --fail-if-no-match build

test: ## Go tests (with -race, with and without the sim tag), TypeScript tests and the contract test
	go -C box test -race -count=1 ./...
	go -C box test -race -count=1 -tags sim ./...
	pnpm test
	pnpm --filter @cloudbox/api-client test:contract

test-e2e: ## Playwright + axe web tests (stub until M2)
	@echo "Playwright + axe web tests arrive in M2 (e2e/). Nothing to run yet."

test-arm64: ## Go tests on linux/arm64 under QEMU (Docker)
	"$(CURDIR)/deploy/docker/test-arm64.sh"

build-pi: web ## Cross-compile boxd, with the web app embedded, for the Raspberry Pi (linux/arm64)
	mkdir -p "$(DIST_DIR)"
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go -C box build -trimpath \
		-ldflags "-s -w -X main.version=$(VERSION)" \
		-o "$(DIST_DIR)/boxd-linux-arm64" ./cmd/boxd
	@echo "built $(DIST_DIR)/boxd-linux-arm64"

reset-dev: ## Delete local dev data (./.data), including the dev TLS certificate
	@echo "deleting $(DATA_DIR) (dev data and dev certificate; paired dev apps must re-pair)"
	rm -rf -- "$(DATA_DIR)"

lint: ## gofmt, go vet, ESLint and Prettier
	@unformatted="$$(gofmt -l box)"; if [ -n "$$unformatted" ]; then echo "gofmt needed:"; echo "$$unformatted"; exit 1; fi
	go -C box vet ./...
	go -C box vet -tags sim ./...
	pnpm lint

generate: ## Regenerate packages/api-client from api/openapi.yaml
	pnpm --filter @cloudbox/api-client generate

check-generated: generate ## Fail if the generated API client is out of date
	@git diff --exit-code -- packages/api-client/src || { echo "packages/api-client is out of date: run 'make generate' and commit"; exit 1; }
