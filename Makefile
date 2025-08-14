## Makefile – Convenience commands for local development
#
# This Makefile aggregates a handful of npm scripts into shorter targets
# to streamline development.  It assumes that you have already run
# `npm install` in the project root and that your environment is set up
# correctly.  To see all available commands, run `make help`.

.PHONY: help dev build start sync-fpl test lint format type-check db-generate

help:
	@echo "Available commands:"
	@echo "  make dev          – Start the Next.js development server"
	@echo "  make build        – Build the production application"
	@echo "  make start        – Start the production server"
	@echo "  make sync-fpl     – Synchronise FPL data into the database"
	@echo "  make test         – Run the unit test suite"
	@echo "  make lint         – Run ESLint against the codebase"
	@echo "  make format       – Format the codebase using Prettier"
	@echo "  make type-check   – Perform a TypeScript type check"
	@echo "  make db-generate  – Generate Prisma client code"

dev:
	npm run dev

build:
	npm run build

start:
	npm run start

sync-fpl:
	npm run sync:fpl

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

type-check:
	npm run type-check

db-generate:
	npm run db:generate