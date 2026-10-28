# Server plus the web pages, so one URL serves everything. Rooms live in memory: run exactly one instance.
FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt server/
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server/server.py server/
COPY web/ web/
ENV PYTHONUNBUFFERED=1
CMD ["python", "server/server.py"]
