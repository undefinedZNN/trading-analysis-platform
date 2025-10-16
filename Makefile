# Trading Analysis Platform - Development Makefile

.PHONY: help dev-up dev-down dev-logs dev-reset db-connect redis-connect install-backend install-frontend install-all

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
	docker-compose -f docker-compose.dev.yml up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "Services started! PostgreSQL: localhost:5432, Redis: localhost:6379"

dev-up-local:
	@echo "Starting development databases (local images)..."
	docker-compose -f docker-compose.local.yml up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "Services started! PostgreSQL: localhost:5432, Redis: localhost:6379"

dev-up-pull:
	@echo "Pulling latest images and starting development databases..."
	docker-compose -f docker-compose.dev.yml pull
	docker-compose -f docker-compose.dev.yml up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "Services started! PostgreSQL: localhost:5432, Redis: localhost:6379"

dev-down:
	@echo "Stopping development databases..."
	docker-compose -f docker-compose.dev.yml down
	docker-compose -f docker-compose.local.yml down 2>/dev/null || true

dev-logs:
	docker-compose -f docker-compose.dev.yml logs -f

dev-reset:
	@echo "Resetting all development data..."
	docker-compose -f docker-compose.dev.yml down -v
	docker-compose -f docker-compose.dev.yml up -d
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
	@docker-compose -f docker-compose.dev.yml ps
	@echo ""
	@echo "Environment file:"
	@if [ -f .env ]; then echo "✓ .env exists"; else echo "✗ .env missing (run 'make setup-env')"; fi
