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
