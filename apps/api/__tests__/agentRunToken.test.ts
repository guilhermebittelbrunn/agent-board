import { beforeEach, describe, expect, it, vi } from "vitest";

const { setTokenMock } = vi.hoisted(() => ({ setTokenMock: vi.fn() }));

vi.mock("@/(shared)/repositories/run.repository", () => ({
    runRepository: { setToken: (...args: unknown[]) => setTokenMock(...args) },
}));

const {
    hashRunSecret,
    isRunTokenExpired,
    issueRunToken,
    matchesRunToken,
    mintRunToken,
} = await import("@/(shared)/lib/agent-contract/run-token");
const { parseRunToken, readBearer } = await import(
    "@/(shared)/lib/agent-contract/run-token-format"
);

const SECRET_LENGTH = 43;
const SECRET = "A".repeat(SECRET_LENGTH);
const SHA256_HEX = /^[0-9a-f]{64}$/;
const MAX_RUN_ID_LENGTH = 128;
const UNDERSCORED_PREFIX = "_a-b_";
const SECRET_WITH_UNDERSCORES = `${UNDERSCORED_PREFIX}${"c".repeat(SECRET_LENGTH - UNDERSCORED_PREFIX.length - 1)}_`;

beforeEach(() => {
    setTokenMock.mockReset();
});

describe("run token format", () => {
    it("mints kbr_<runId>_<secret> and stores only the hash of the secret", () => {
        const { token, tokenHash } = mintRunToken("r9Xa");
        const parsed = parseRunToken(token);

        expect(token.startsWith("kbr_r9Xa_")).toBe(true);
        expect(parsed?.runId).toBe("r9Xa");
        expect(parsed?.secret).toHaveLength(SECRET_LENGTH);
        expect(tokenHash).toMatch(SHA256_HEX);
        expect(tokenHash).toBe(hashRunSecret(parsed?.secret ?? ""));
        expect(tokenHash).not.toContain(parsed?.secret ?? "");
    });

    it("mints a different secret every time", () => {
        expect(mintRunToken("r1").token).not.toBe(mintRunToken("r1").token);
    });

    it.each([
        ["a wrong prefix", `kbx_r1_${SECRET}`],
        ["a short secret", `kbr_r1_${SECRET.slice(1)}`],
        ["a long secret", `kbr_r1_${SECRET}A`],
        ["a run id with a slash", `kbr_r/1_${SECRET}`],
        ["an empty run id", `kbr__${SECRET}`],
        ["a JWT", "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1In0.sig"],
        [
            "a run id past 128 characters",
            `kbr_${"r".repeat(MAX_RUN_ID_LENGTH + 1)}_${SECRET}`,
        ],
        ["a run id with an underscore", `kbr_r_1_${SECRET}`],
    ])("refuses %s", (_label, token) => {
        expect(parseRunToken(token)).toBeNull();
    });

    it("splits at the first underscore, so the secret may hold more of them", () => {
        expect(SECRET_WITH_UNDERSCORES).toHaveLength(SECRET_LENGTH);
        expect(parseRunToken(`kbr_r1_${SECRET_WITH_UNDERSCORES}`)).toEqual({
            runId: "r1",
            secret: SECRET_WITH_UNDERSCORES,
        });
    });

    it("accepts a run id of exactly 128 characters", () => {
        const runId = "r".repeat(MAX_RUN_ID_LENGTH);
        expect(parseRunToken(`kbr_${runId}_${SECRET}`)?.runId).toBe(runId);
    });

    it("reads the bearer token and nothing else", () => {
        expect(readBearer(`Bearer kbr_r1_${SECRET}`)).toBe(`kbr_r1_${SECRET}`);
        expect(readBearer(`Basic kbr_r1_${SECRET}`)).toBeNull();
        expect(readBearer("Bearer ")).toBeNull();
        expect(readBearer(null)).toBeNull();
    });
});

describe("run token check", () => {
    it("accepts the secret whose hash is stored", () => {
        expect(matchesRunToken(SECRET, hashRunSecret(SECRET))).toBe(true);
    });

    it("refuses another secret, a hash of another size and a run without a token", () => {
        expect(
            matchesRunToken("B".repeat(SECRET_LENGTH), hashRunSecret(SECRET))
        ).toBe(false);
        expect(matchesRunToken(SECRET, "abc")).toBe(false);
        expect(matchesRunToken(SECRET, null)).toBe(false);
    });

    it("expires at the exact instant of the expiry, and without one", () => {
        const expiresAt = "2026-11-26T10:45:00.000Z";

        expect(
            isRunTokenExpired(expiresAt, new Date("2026-11-26T10:44:59.999Z"))
        ).toBe(false);
        expect(isRunTokenExpired(expiresAt, new Date(expiresAt))).toBe(true);
        expect(isRunTokenExpired(null, new Date(expiresAt))).toBe(true);
    });
});

describe("issueRunToken", () => {
    it("stores the hash and hands the token out once, with the run's deadline", async () => {
        setTokenMock.mockResolvedValue({
            ok: true,
            expiresAt: "2026-11-26T10:45:00.000Z",
        });

        const issued = await issueRunToken("r1");

        expect(issued).toMatchObject({
            ok: true,
            expiresAt: "2026-11-26T10:45:00.000Z",
        });
        const token = issued.ok ? issued.token : "";
        const [runId, storedHash] = setTokenMock.mock.calls[0] as [
            string,
            string,
        ];
        expect(runId).toBe("r1");
        expect(storedHash).toBe(
            hashRunSecret(parseRunToken(token)?.secret ?? "")
        );
        expect(storedHash).not.toBe(token);
    });

    it("refuses a run that is not running", async () => {
        setTokenMock.mockResolvedValue({ ok: false });

        expect(await issueRunToken("r1")).toEqual({
            ok: false,
            code: "AGENT_RUN_CLOSED",
        });
    });
});
