# Build from the repository root so the helper script comes along:
#   docker build -f apps/browser-worker/Dockerfile -t wonderjobs-browser-worker .
FROM mcr.microsoft.com/playwright:v1.63.0-noble
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NODE_ENV=production PORT=4100
WORKDIR /app
COPY apps/browser-worker/package.json apps/browser-worker/tsconfig.json ./
COPY apps/browser-worker/src ./src
# The very same helper the Chrome extension runs on an employer's page.
COPY extension/content/autofill.js ./helper/autofill.js
RUN npm install --no-audit --no-fund --include=dev && npm run build && npm prune --omit=dev
USER pwuser
EXPOSE 4100
CMD ["node", "dist/server.js"]
