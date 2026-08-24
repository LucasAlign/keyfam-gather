import type { Instrumentation } from "next";
import { logger, serializeError } from "@/lib/logger";

// Next invokes this for every server error it captures — route handlers, server
// components, and server actions alike — so it is the one place to centralise
// error reporting without wrapping each entry point. See
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;

  logger.error("Unhandled server error", {
    ...serializeError(error),
    digest,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });

  // Optional forward to an external monitor (Sentry ingest, an alerting webhook,
  // ...) without taking on a client dependency. Failures here must never mask
  // the original error, so they are swallowed after being logged.
  const webhookUrl = process.env.ERROR_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
          digest,
          path: request.path,
          method: request.method,
          routePath: context.routePath,
          routeType: context.routeType,
        }),
      });
    } catch (forwardError) {
      logger.warn("Error webhook forwarding failed", serializeError(forwardError));
    }
  }
};
