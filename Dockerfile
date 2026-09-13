FROM python:3.12-slim

# Run as an unprivileged user rather than root
RUN useradd --create-home --uid 10001 gridpoint

WORKDIR /app

# No external Python dependencies — stdlib only
COPY --chown=gridpoint:gridpoint app/ ./

USER gridpoint

EXPOSE 8080

ENV PORT=8080

CMD ["python", "server.py"]
