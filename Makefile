# Trading Analysis Platform - Development Makefile

DOCKER_COMPOSE ?= $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")
COMPOSE_FILE_DEV ?= docker-compose.dev.yml
COMPOSE_FILE_LOCAL ?= docker-compose.local.yml

.PHONY: help dev-up dev-up-local dev-up-pull dev-down dev-logs dev-reset db-connect redis-connect install-backend install-frontend install-all setup-env status

# Default target
help:
	@echo "Trading Analysis Platform - Development Commands"
	@echo ""
	@echo "Database & Services:"
	@echo "  dev-up          Start development databases (PostgreSQL + Redis)"
	@echo "  dev-up-local    Start with local Docker images (fallback)"
	@echo "  dev-up-pull     Pull latest images and start"
	@echo "  dev-down        Stop development databases"
	@echo "  dev-logs        Show database logs"
	@echo "  dev-reset       Reset all data (removes volumes)"
	@echo "  db-connect      Connect to PostgreSQL database"
	@echo "  redis-connect   Connect to Redis CLI"
	@echo ""
	@echo "Development:"
	@echo "  install-all     Install dependencies for all projects"
	@echo "  install-backend Install backend dependencies"
	@echo "  install-frontend Install frontend dependencies"
	@echo ""
	@echo "Environment:"
	@echo "  setup-env       Copy .env.example to .env"

# Database and services
dev-up:
	@echo "Starting development databases..."
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE_DEV) up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "Services started! PostgreSQL: localhost:5432, Redis: localhost:6379"

dev-up-local:
	@echo "Starting development databases (local images)..."
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE_LOCAL) up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "Services started! PostgreSQL: localhost:5432, Redis: localhost:6379"

dev-up-pull:
	@echo "Pulling latest images and starting development databases..."
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE_DEV) pull
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE_DEV) up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "Services started! PostgreSQL: localhost:5432, Redis: localhost:6379"

dev-down:
	@echo "Stopping development databases..."
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE_DEV) down
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE_LOCAL) down 2>/dev/null || true

dev-logs:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE_DEV) logs -f

dev-reset:
	@echo "Resetting all development data..."
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE_DEV) down -v
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE_DEV) up -d
	@echo "Development environment reset complete!"

db-connect:
	docker exec -it trading-postgres psql -U trading_user -d trading_analysis

redis-connect:
	docker exec -it trading-redis redis-cli

# Development setup
setup-env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env file from .env.example"; \
		echo "Please review and update the values in .env"; \
	else \
		echo ".env file already exists"; \
	fi

install-backend:
	@if [ -d "backend" ] && [ -f "backend/package.json" ]; then \
		cd backend && npm install; \
	else \
		echo "Backend directory or package.json not found"; \
	fi

install-frontend:
	@if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then \
		cd frontend && npm install; \
	else \
		echo "Frontend directory or package.json not found"; \
	fi

install-all: install-backend install-frontend

# Status check
status:
	@echo "Development Environment Status:"
	@echo "================================"
	@$(DOCKER_COMPOSE) -f $(COMPOSE_FILE_DEV) ps
	@echo ""
	@echo "Environment file:"
	@if [ -f .env ]; then echo "✓ .env exists"; else echo "✗ .env missing (run 'make setup-env')"; fi
