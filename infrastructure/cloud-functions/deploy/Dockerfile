FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir flask==3.1.0

COPY serve_vault_search.py requirements.txt semantic_dashboard.html ./
COPY learning_base/ ./learning_base/

ENV PORT=8080

CMD ["python3", "-c", "from serve_vault_search import app; app.run(host='0.0.0.0', port=8080, debug=False, threaded=True)"]
