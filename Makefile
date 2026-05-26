# ─── Nintendo Stock Quest — Makefile ─────────────────────────────────────────
SHELL   := /bin/bash
BACKEND := http://localhost:8000
PYTHON  := python3

.DEFAULT_GOAL := help

.PHONY: help dev down backend logs rebuild \
        health metrics stock history \
        grafana prometheus \
        test test-cov lint fmt \
        deploy-railway deploy-render \
        clean

# ─── Ajuda ───────────────────────────────────────────────────────────────────

help: ## 📖 Mostra esta ajuda
	@echo ""
	@echo "  🎮 Nintendo Stock Quest"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ \
	  {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

# ─── Docker ──────────────────────────────────────────────────────────────────

dev: ## 🚀 Sobe tudo (API + Frontend + Prometheus + Grafana)
	@docker compose up --build -d
	@echo ""
	@echo "  ┌──────────────────────────────────────────────────┐"
	@echo "  │  🎮  Nintendo Stock Quest rodando!               │"
	@echo "  │                                                  │"
	@echo "  │  Frontend   → http://localhost:3000              │"
	@echo "  │  API        → http://localhost:8000              │"
	@echo "  │  Swagger    → http://localhost:8000/docs         │"
	@echo "  │  Health     → http://localhost:8000/health       │"
	@echo "  │  Metrics    → http://localhost:8000/metrics      │"
	@echo "  │  Prometheus → http://localhost:9090              │"
	@echo "  │  Grafana    → http://localhost:3001              │"
	@echo "  │             (user: admin / senha: nintendo)      │"
	@echo "  └──────────────────────────────────────────────────┘"

down: ## 🛑 Para todos os containers
	docker compose down

logs: ## 📜 Logs do backend em tempo real
	docker compose logs -f backend

rebuild: ## 🔄 Reconstrói e reinicia o backend
	docker compose up --build -d backend

# ─── Desenvolvimento local (sem Docker) ──────────────────────────────────────

backend: ## ⚡ Backend local com hot-reload (sem Docker)
	cd backend && uvicorn main:app --reload --port 8000

# ─── Observabilidade ─────────────────────────────────────────────────────────

health: ## ❤️  Health check da API
	@curl -s $(BACKEND)/health | $(PYTHON) -m json.tool

metrics: ## 📊 Métricas no formato Prometheus
	@curl -s $(BACKEND)/metrics

stock: ## 💰 Cotação atual da Nintendo (NTDOY)
	@curl -s $(BACKEND)/api/stock/NTDOY | $(PYTHON) -m json.tool

history: ## 🗂️  Histórico persistido no banco (últimos 30d)
	@curl -s "$(BACKEND)/api/stock/NTDOY/history?days=30" | $(PYTHON) -m json.tool

grafana: ## 📈 Abre o Grafana no navegador
	@echo "Abrindo Grafana em http://localhost:3001 ..."
	@which xdg-open >/dev/null 2>&1 && xdg-open http://localhost:3001 || \
	  which open >/dev/null 2>&1 && open http://localhost:3001 || \
	  echo "  → Acesse: http://localhost:3001 (admin / nintendo)"

prometheus: ## 🔭 Abre o Prometheus no navegador
	@echo "Abrindo Prometheus em http://localhost:9090 ..."
	@which xdg-open >/dev/null 2>&1 && xdg-open http://localhost:9090 || \
	  which open >/dev/null 2>&1 && open http://localhost:9090 || \
	  echo "  → Acesse: http://localhost:9090"

# ─── Qualidade de código ──────────────────────────────────────────────────────

lint: ## 🔍 flake8 + black + isort (check)
	cd backend && \
	  flake8 . --max-line-length=100 --exclude=tests/ && \
	  black --check --line-length=100 . && \
	  isort --check-only .

fmt: ## ✏️  Formata código automaticamente
	cd backend && black --line-length=100 . && isort .

test: ## 🧪 Executa testes
	cd backend && pytest tests/ -v --tb=short

test-cov: ## 🧪 Testes com cobertura
	cd backend && pytest tests/ -v --cov=. --cov-report=term-missing

# ─── Deploy em cloud ─────────────────────────────────────────────────────────

deploy-railway: ## 🚂 Deploy no Railway (requer railway CLI)
	@which railway >/dev/null 2>&1 || (echo "Instale: npm i -g @railway/cli" && exit 1)
	railway up

deploy-render: ## 🟣 Deploy no Render (via render.yaml)
	@echo "Faça push para o GitHub — o Render detecta render.yaml automaticamente."
	@echo "Docs: https://render.com/docs/infrastructure-as-code"

# ─── Limpeza ─────────────────────────────────────────────────────────────────

clean: ## 🧹 Remove containers, volumes e cache
	docker compose down --rmi local --volumes --remove-orphans
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	rm -f backend/data/stock_history.db 2>/dev/null || true
