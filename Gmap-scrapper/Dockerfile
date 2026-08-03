FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir playwright==1.49.1 && \
    playwright install --with-deps chromium

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8787
EXPOSE 8787

CMD ["python", "server.py"]
