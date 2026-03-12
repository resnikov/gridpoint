FROM python:3.12-slim

WORKDIR /app

# No external Python dependencies — stdlib only
COPY app/ ./

EXPOSE 8080

ENV PORT=8080

CMD ["python", "server.py"]
