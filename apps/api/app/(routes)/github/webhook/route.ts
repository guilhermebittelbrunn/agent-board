import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { logEvent } from "@repo/shared/utils/helpers/log";
import { githubWebhookSecret } from "@/(shared)/lib/github/github-app-config";
import { githubAppNotConfiguredResponse } from "@/(shared)/lib/github/github-errors";
import { applyWebhookEvent } from "@/(shared)/lib/github/github-webhook-events";
import { isValidWebhookSignature } from "@/(shared)/lib/github/github-webhook-signature";
import { readCappedBody } from "@/(shared)/lib/read-capped-body";
import { env } from "@/env";

/**
 * Far above the events handled here, far below GitHub's 25 MB ceiling: the body is read
 * before its signature can be checked, so this is what an anonymous caller can make the
 * API buffer.
 */
const WEBHOOK_MAX_BYTES = 1_048_576;

const errorResponse = (code: string, status: number): Response =>
    Response.json({ error: { code } }, { status });

function parseJson(body: Buffer): unknown {
    try {
        return JSON.parse(body.toString("utf8"));
    } catch {
        return;
    }
}

export async function POST(req: Request) {
    const secret = githubWebhookSecret(env);
    if (!secret) {
        return githubAppNotConfiguredResponse();
    }

    const body = req.body
        ? await readCappedBody(req.body, WEBHOOK_MAX_BYTES)
        : Buffer.alloc(0);
    if (body === null) {
        return errorResponse(
            "GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE",
            HTTP_STATUS.PAYLOAD_TOO_LARGE
        );
    }

    if (
        !isValidWebhookSignature(
            body,
            req.headers.get("x-hub-signature-256"),
            secret
        )
    ) {
        logEvent("github", "webhook-signature-invalid");
        return errorResponse(
            "GITHUB_WEBHOOK_SIGNATURE_INVALID",
            HTTP_STATUS.UNAUTHORIZED
        );
    }

    const event = req.headers.get("x-github-event") ?? "unknown";
    const delivery = req.headers.get("x-github-delivery");
    const payload = parseJson(body);
    const outcome =
        payload === undefined ? null : applyWebhookEvent(event, payload);

    if (!outcome || outcome.invalid) {
        logEvent("github", "webhook-payload-invalid", { event, delivery });
        return errorResponse(
            "GITHUB_WEBHOOK_PAYLOAD_INVALID",
            HTTP_STATUS.BAD_REQUEST
        );
    }

    logEvent("github", "webhook-received", {
        event,
        delivery,
        action: outcome.action,
        handled: outcome.handled,
    });
    return Response.json({ data: { handled: outcome.handled } });
}
