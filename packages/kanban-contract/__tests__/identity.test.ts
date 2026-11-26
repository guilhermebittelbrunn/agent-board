import { describe, expect, it } from "vitest";
import { githubIdentitySchema, githubLoginSchema } from "../src/identity";

const GITHUB_LOGIN_MAX_LENGTH = 39;
const LONGEST_LOGIN = "a".repeat(GITHUB_LOGIN_MAX_LENGTH);

const identity = {
    id: "583231",
    login: "octocat",
    name: "The Octocat",
    avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
};

describe("githubLoginSchema", () => {
    it.each(["octocat", "a-b", "A1", "x", LONGEST_LOGIN])(
        "accepts %s",
        (login) => {
            expect(githubLoginSchema.safeParse(login).success).toBe(true);
        }
    );

    it.each([
        ["leading hyphen", "-octocat"],
        ["trailing hyphen", "octocat-"],
        ["double hyphen", "octo--cat"],
        ["40 characters", `${LONGEST_LOGIN}a`],
        ["space", "octo cat"],
        ["empty", ""],
        ["underscore", "octo_cat"],
    ])("refuses a login with %s", (_label, login) => {
        expect(githubLoginSchema.safeParse(login).success).toBe(false);
    });
});

describe("githubIdentitySchema", () => {
    it("accepts a full identity", () => {
        expect(githubIdentitySchema.parse(identity)).toEqual(identity);
    });

    it("accepts an identity with no name and no avatar", () => {
        const result = githubIdentitySchema.safeParse({
            ...identity,
            name: null,
            avatarUrl: null,
        });

        expect(result.success).toBe(true);
    });

    it.each(["abc", "12a", "", "-1"])("refuses the id %s", (id) => {
        expect(
            githubIdentitySchema.safeParse({ ...identity, id }).success
        ).toBe(false);
    });

    it("refuses an avatar that is not an http(s) URL", () => {
        const result = githubIdentitySchema.safeParse({
            ...identity,
            avatarUrl: "javascript:alert(1)",
        });

        expect(result.success).toBe(false);
    });

    it("refuses an invalid login inside the identity", () => {
        expect(
            githubIdentitySchema.safeParse({ ...identity, login: "-bad" })
                .success
        ).toBe(false);
    });
});
