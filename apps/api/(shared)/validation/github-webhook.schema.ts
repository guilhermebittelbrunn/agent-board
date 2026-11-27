import { z } from "zod";

const repositoryRefSchema = z.object({ full_name: z.string().min(1) });

export const memberEventSchema = z.object({
    action: z.string(),
    repository: repositoryRefSchema,
});

export const installationRepositoriesEventSchema = z.object({
    action: z.string(),
    repositories_added: z.array(repositoryRefSchema).default([]),
    repositories_removed: z.array(repositoryRefSchema).default([]),
});

const loginSchema = z.object({ login: z.string().min(1) });
const installationSchema = z.object({ id: z.number().int() }).optional();

export const pullRequestEventSchema = z.object({
    action: z.string(),
    pull_request: z.object({
        number: z.number().int().positive(),
        title: z.string(),
        draft: z.boolean().optional(),
        merged: z.boolean().nullish(),
        merged_by: loginSchema.nullish(),
        commits: z.number().int().nonnegative().optional(),
        head: z.object({ ref: z.string(), sha: z.string() }),
    }),
    repository: repositoryRefSchema,
    installation: installationSchema,
    sender: loginSchema,
});

export const pullRequestReviewEventSchema = z.object({
    action: z.string(),
    review: z.object({
        user: loginSchema,
        state: z.string(),
        body: z.string().nullish(),
    }),
    pull_request: z.object({ number: z.number().int().positive() }),
    repository: repositoryRefSchema,
    installation: installationSchema,
});

export const issueCommentEventSchema = z.object({
    action: z.string(),
    issue: z.object({
        number: z.number().int().positive(),
        pull_request: z.unknown().optional(),
    }),
    comment: z.object({ user: loginSchema }),
    repository: repositoryRefSchema,
    installation: installationSchema,
});

export const checkSuiteEventSchema = z.object({
    action: z.string(),
    check_suite: z.object({
        head_sha: z.string(),
        conclusion: z.string().nullish(),
        app: z.object({ slug: z.string().min(1), name: z.string().optional() }),
        pull_requests: z.array(
            z.object({ number: z.number().int().positive() })
        ),
    }),
    repository: repositoryRefSchema,
    installation: installationSchema,
});
