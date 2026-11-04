# embedder

FastAPI service that turns a search query into 384-dim vector, using fastembed with `paraphrase-multilingual-MiniLM-L12-v2`.

```bash
uv run uvicorn main:app --port 8001
curl -X POST localhost:8001/embed -H "Content-Type: application/json" -d '{"text": "Hello world"}'
```