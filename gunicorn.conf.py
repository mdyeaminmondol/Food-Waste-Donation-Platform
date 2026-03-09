import os

bind = f"0.0.0.0:{os.environ.get('PORT', '5000')}"
workers = int(os.environ.get("WEB_CONCURRENCY", "1"))
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"
timeout = 120
graceful_timeout = 30
keepalive = 5
loglevel = os.environ.get("LOG_LEVEL", "info")
accesslog = "-"
errorlog = "-"
